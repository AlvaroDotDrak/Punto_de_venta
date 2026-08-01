"""Resumen del turno por correo.

Se dispara al cerrar la caja, no en un horario fijo: la app corre en el PC del
local y a las 22:00 puede estar apagado. El cierre es además el momento en que
existe justo la información que interesa (esperado, contado, diferencia).

Usa smtplib de la librería estándar: no agrega dependencias al .exe.
"""
import smtplib
import ssl
import threading
from email.message import EmailMessage

from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import CashMovement, CashRegister, Product, Sale, SaleItem, SystemConfig


def _get(db: Session, key: str, default: str = "") -> str:
    item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return (item.value if item else None) or default


def get_mail_config(db: Session) -> dict:
    return {
        "enabled": _get(db, "smtp_enabled") == "true",
        "host": _get(db, "smtp_host", "smtp.gmail.com"),
        "port": int(_get(db, "smtp_port", "587") or 587),
        "user": _get(db, "smtp_user"),
        "password": _get(db, "smtp_password"),
        "from_name": _get(db, "smtp_from_name", "Punto de Venta"),
        "recipients": [r.strip() for r in _get(db, "report_recipients").split(",") if r.strip()],
    }


def is_configured(cfg: dict) -> bool:
    return bool(cfg["host"] and cfg["user"] and cfg["password"] and cfg["recipients"])


def _money(v) -> str:
    """CLP sin decimales y con punto de miles, igual que formatCurrency."""
    return "$" + f"{round(v or 0):,}".replace(",", ".")


def build_summary(db: Session, register: CashRegister) -> tuple[str, str]:
    """Devuelve (asunto, cuerpo HTML) del resumen de un turno cerrado."""
    movs = db.query(CashMovement).filter(CashMovement.register_id == register.id).all()

    def suma(tipo, metodo=None):
        return sum(m.amount for m in movs
                   if m.type == tipo and (metodo is None or m.payment_method == metodo))

    ventas_brutas = suma("sale")
    anulaciones = suma("void")            # ya vienen en negativo
    ventas = ventas_brutas + anulaciones
    n_ventas = len([m for m in movs if m.type == "sale"]) - len([m for m in movs if m.type == "void"])

    efectivo = suma("sale", "efectivo") + suma("void", "efectivo")
    tarjeta = suma("sale", "tarjeta") + suma("void", "tarjeta")
    debito = suma("sale", "debito") + suma("void", "debito")
    transferencia = suma("sale", "transferencia") + suma("void", "transferencia")
    gastos = suma("expense")
    retiros = suma("withdrawal")
    ingresos = suma("income")

    diferencia = (register.closing_amount or 0) - (register.expected_amount or 0)

    # Ventas del turno para descuentos y ranking de productos
    q = db.query(Sale).filter(Sale.created_at >= register.opened_at, Sale.status == "completed")
    if register.closed_at:
        q = q.filter(Sale.created_at <= register.closed_at)
    ventas_turno = q.all()
    descuentos = sum(s.discount_amount or 0 for s in ventas_turno)

    ranking = {}
    por_categoria: dict[str, float] = {}
    vendidos: dict[int, float] = {}
    if ventas_turno:
        ids = [s.id for s in ventas_turno]
        for it in db.query(SaleItem).filter(SaleItem.sale_id.in_(ids)).all():
            acc = ranking.setdefault(it.product_name, {"n": 0, "total": 0.0})
            acc["n"] += it.quantity
            acc["total"] += it.subtotal
            cat = it.product.category if it.product else "otros"
            por_categoria[cat] = por_categoria.get(cat, 0) + it.subtotal
            if it.product_id:
                vendidos[it.product_id] = vendidos.get(it.product_id, 0) + it.quantity
    top = sorted(ranking.items(), key=lambda kv: kv[1]["total"], reverse=True)[:5]

    # Etiquetas legibles de las categorías del rubro
    try:
        import json as _json
        etiquetas = {c["value"]: c["label"] for c in _json.loads(_get(db, "product_categories") or "[]")}
    except (ValueError, TypeError):
        etiquetas = {}

    # El remanente solo se muestra en las categorías configuradas (lo perecible).
    # En el resto se lista solo lo vendido: cuántas bebidas quedan es ruido.
    try:
        import json as _j
        con_remanente = set(_j.loads(_get(db, "report_stock_categories") or "[]"))
    except (ValueError, TypeError):
        con_remanente = set()

    con_stock = (db.query(Product)
                 .filter(Product.active == True, Product.stock.isnot(None))  # noqa: E712
                 .order_by(Product.category, Product.name).all())
    quedan = []
    for prod in con_stock:
        v = vendidos.get(prod.id, 0)
        muestra = not con_remanente or prod.category in con_remanente
        if muestra and (v or (prod.stock or 0) > 0):
            quedan.append((prod, v, True))
        elif not muestra and v:
            quedan.append((prod, v, False))

    negocio = _get(db, "branding")
    nombre = "Punto de Venta"
    if negocio:
        import json
        try:
            nombre = json.loads(negocio).get("name") or nombre
        except (ValueError, TypeError):
            pass

    fecha = (register.closed_at or register.opened_at).strftime("%d/%m/%Y")
    asunto = f"{nombre} — Cierre de caja {fecha} · {_money(ventas)} en ventas"

    # El color de la diferencia es lo primero que se mira en el teléfono.
    ok = abs(diferencia) < float(_get(db, "cash_diff_tolerance", "500") or 500)
    color_dif = "#2E8B57" if ok else "#C0392B"
    signo = "+" if diferencia >= 0 else "−"

    def fila(label, valor, negrita=False, color=None):
        peso = "700" if negrita else "400"
        c = f"color:{color};" if color else ""
        return (f'<tr><td style="padding:6px 0;color:#555">{label}</td>'
                f'<td style="padding:6px 0;text-align:right;font-weight:{peso};{c}">{valor}</td></tr>')

    filas_top = "".join(
        f'<tr><td style="padding:4px 0;color:#555">{n}</td>'
        f'<td style="padding:4px 0;text-align:right">{int(d["n"])} · {_money(d["total"])}</td></tr>'
        for n, d in top
    ) or '<tr><td colspan="2" style="color:#999;padding:4px 0">Sin ventas</td></tr>'

    filas_mov = "".join([
        fila("Gastos pagados en efectivo", "− " + _money(gastos)) if gastos else "",
        fila("Retiros", "− " + _money(retiros)) if retiros else "",
        fila("Ingresos manuales", "+ " + _money(ingresos)) if ingresos else "",
    ])
    movimientos_html = (
        '<h3 style="font-size:15px;margin:0 0 6px">Movimientos de caja</h3>'
        '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">'
        f'{filas_mov}</table>'
    ) if filas_mov else ""

    filas_cat = "".join(
        fila(etiquetas.get(c, c.capitalize()), _money(v))
        for c, v in sorted(por_categoria.items(), key=lambda kv: kv[1], reverse=True)
    )
    categorias_html = (
        '<h3 style="font-size:15px;margin:0 0 6px">Ventas por categoría</h3>'
        '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">'
        f'{filas_cat}</table>'
    ) if filas_cat else ""

    filas_stock = "".join(
        f'<tr><td style="padding:4px 0;color:#555">{p.name}</td>'
        f'<td style="padding:4px 0;text-align:right">{v:g} vendidos</td>'
        + (f'<td style="padding:4px 0;text-align:right;font-weight:700">{p.stock:g} quedan</td>'
           if muestra else '<td></td>')
        + '</tr>'
        for p, v, muestra in quedan
    )
    stock_html = (
        '<h3 style="font-size:15px;margin:0 0 6px">Vendido y lo que queda</h3>'
        '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">'
        f'{filas_stock}</table>'
    ) if filas_stock else ""

    html = f"""<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#222">
  <h2 style="margin:0 0 4px">{nombre}</h2>
  <p style="margin:0 0 16px;color:#777;font-size:14px">Cierre de caja · {fecha}</p>

  <div style="background:#F7F5F2;border-radius:10px;padding:14px 16px;margin-bottom:16px">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      {fila("Abierta", register.opened_at.strftime("%d/%m %H:%M") + (f" por {register.opened_by}" if register.opened_by else ""))}
      {fila("Cerrada", (register.closed_at.strftime("%d/%m %H:%M") if register.closed_at else "—") + (f" por {register.closed_by}" if register.closed_by else ""))}
    </table>
  </div>

  <h3 style="font-size:15px;margin:0 0 6px">Cuadre de efectivo</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
    {fila("Monto inicial", _money(register.opening_amount))}
    {fila("Efectivo esperado", _money(register.expected_amount))}
    {fila("Efectivo contado", _money(register.closing_amount))}
    {fila("Diferencia", f"{signo} {_money(abs(diferencia))}", negrita=True, color=color_dif)}
  </table>

  <h3 style="font-size:15px;margin:0 0 6px">Ventas</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px">
    {fila("Total vendido", _money(ventas), negrita=True)}
    {fila("Transacciones", str(n_ventas))}
    {fila("Efectivo", _money(efectivo))}
    {fila("Tarjeta", _money(tarjeta))}
    {fila("Débito", _money(debito)) if debito else ""}
    {fila("Transferencia", _money(transferencia))}
    {fila("Descuentos otorgados", "− " + _money(descuentos), color="#B45309") if descuentos else ""}
    {fila("Anulaciones", _money(abs(anulaciones)), color="#C0392B") if anulaciones else ""}
  </table>

  {categorias_html}

  {stock_html}

  {movimientos_html}

  <h3 style="font-size:15px;margin:0 0 6px">Lo más vendido</h3>
  <table style="width:100%;border-collapse:collapse;font-size:14px">{filas_top}</table>

  {f'<div style="margin-top:16px;padding:10px 14px;background:#FFF8E1;border-radius:8px;font-size:13px"><strong>Observaciones:</strong> {register.notes}</div>' if register.notes else ""}

  <p style="margin-top:24px;color:#999;font-size:12px">Enviado automáticamente al cerrar la caja.</p>
</div>"""
    return asunto, html


def send_mail(cfg: dict, asunto: str, html: str) -> None:
    """Envía por SMTP. Lanza excepción si falla — el llamador decide qué hacer."""
    msg = EmailMessage()
    msg["Subject"] = asunto
    msg["From"] = f"{cfg['from_name']} <{cfg['user']}>"
    msg["To"] = ", ".join(cfg["recipients"])
    msg.set_content("Este resumen se ve mejor en un cliente de correo con HTML.")
    msg.add_alternative(html, subtype="html")

    contexto = ssl.create_default_context()
    if cfg["port"] == 465:
        with smtplib.SMTP_SSL(cfg["host"], cfg["port"], context=contexto, timeout=30) as srv:
            srv.login(cfg["user"], cfg["password"])
            srv.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"], timeout=30) as srv:
            srv.starttls(context=contexto)
            srv.login(cfg["user"], cfg["password"])
            srv.send_message(msg)


def send_close_summary_async(register_id: int) -> None:
    """Dispara el resumen en segundo plano.

    Nunca debe bloquear ni hacer fallar el cierre de caja: sería absurdo que la
    cajera no pueda cerrar porque se cayó el wifi. Usa su propia sesión de DB
    porque corre fuera del request.
    """
    def _worker():
        db = SessionLocal()
        try:
            cfg = get_mail_config(db)
            if not cfg["enabled"] or not is_configured(cfg):
                return
            register = db.query(CashRegister).filter(CashRegister.id == register_id).first()
            if not register:
                return
            asunto, html = build_summary(db, register)
            send_mail(cfg, asunto, html)
        except Exception as e:  # noqa: BLE001 — el envío jamás puede tumbar la app
            print(f"[mailer] No se pudo enviar el resumen de la caja {register_id}: {e}")
        finally:
            db.close()

    threading.Thread(target=_worker, daemon=True).start()
