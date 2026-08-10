"""
Impresión de boletas en impresora térmica (ESC/POS, 80mm).

Manda los bytes RAW al spooler de Windows vía pywin32. Si pywin32 no está
disponible (ej. servidor Linux), los endpoints devuelven 503 sin tumbar la app.
"""
import base64
import io
import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Sale, SystemConfig
from ..auth import get_current_seller, require_admin, require_permission

try:
    import win32print
    _PRINT_AVAILABLE = True
except ImportError:
    _PRINT_AVAILABLE = False

try:
    from PIL import Image
    _IMG_AVAILABLE = True
except ImportError:
    _IMG_AVAILABLE = False

router = APIRouter(prefix="/print", tags=["printing"])

LINE_WIDTH = 48  # columnas de una térmica de 80mm con Font A

# ── Comandos ESC/POS ─────────────────────────────────────────────────────────
_INIT = b"\x1b@"
# Las POS-80 clónicas arrancan en modo de caracteres chinos (multibyte): un byte
# alto como el de "¡" se combina con el siguiente y sale un glifo chino. FS . lo
# cancela; ESC t 2 selecciona CP850 (Latin-1), que sí trae ¡ ¿ ñ y vocales
# acentuadas en mayúscula (CP437 no tiene la Í, salía "?").
_CANCEL_KANJI = b"\x1c\x2e"
_CHARSET = b"\x1b\x74\x02"
_CENTER = b"\x1b\x61\x01"
_LEFT = b"\x1b\x61\x00"
_BOLD_ON = b"\x1bE\x01"
_BOLD_OFF = b"\x1bE\x00"
_BIG_ON = b"\x1d\x21\x11"   # doble alto y ancho
_BIG_OFF = b"\x1d\x21\x00"
_TALL_ON = b"\x1b!\x18"     # negrita + doble alto (no cambia el ancho en columnas)
_TALL_OFF = b"\x1b!\x00"
_LINESPACING = b"\x1b\x33\x28"  # ESC 3 40: interlineado más holgado (menos compacto)
_FEED_CUT = b"\x1bd\x09\x1dV\x01"  # avanzar 9 líneas + corte parcial (deja espacio bajo el cabezal)
# ESC p: pulso al cajón de dinero por el conector RJ11/RJ12 de la impresora.
# Se manda a ambos pines (2 y 5) porque el cableado varía según la caja; el pin
# no conectado se ignora. Pulso de 50ms on / 500ms off (valores estándar).
_KICK_DRAWER = b"\x1b\x70\x00\x19\xfa" + b"\x1b\x70\x01\x19\xfa"

_SEP = "=" * LINE_WIDTH
_SUB = "-" * LINE_WIDTH

LOGO_WIDTH = 384  # ancho objetivo del logo en puntos (de 576 máx en 80mm)


class PrintReceiptRequest(BaseModel):
    sale_id: int
    cash_received: float | None = None


def _money(n) -> str:
    return "$" + f"{int(round(n or 0)):,}".replace(",", ".")


def _row(left: str, right: str) -> str:
    spaces = LINE_WIDTH - len(left) - len(right)
    return left + " " * max(1, spaces) + right


def _txt(s: str) -> bytes:
    return s.encode("cp850", "replace")


def _printer_name(db: Session) -> str:
    item = db.query(SystemConfig).filter(SystemConfig.key == "printer_name").first()
    return (item.value if item and item.value else "POS-80")


def _branding(db: Session) -> dict:
    item = db.query(SystemConfig).filter(SystemConfig.key == "branding").first()
    if not item:
        return {}
    try:
        return json.loads(item.value)
    except (ValueError, TypeError):
        return {}


def _json_config(db: Session, key: str, default):
    item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if not item:
        return default
    try:
        return json.loads(item.value)
    except (ValueError, TypeError):
        return default


def _categorias(db: Session) -> list[dict]:
    """Categorías del rubro, para imprimir la etiqueta legible en vez del slug."""
    item = db.query(SystemConfig).filter(SystemConfig.key == "product_categories").first()
    if not item:
        return []
    try:
        return json.loads(item.value)
    except (ValueError, TypeError):
        return []


def _wrap(texto: str, ancho: int = LINE_WIDTH) -> list[str]:
    """Corta un texto en líneas del ancho del papel, sin partir palabras."""
    lineas, actual = [], ""
    for palabra in (texto or "").split():
        if len(actual) + len(palabra) + (1 if actual else 0) <= ancho:
            actual = f"{actual} {palabra}".strip()
        else:
            if actual:
                lineas.append(actual)
            actual = palabra[:ancho]
    if actual:
        lineas.append(actual)
    return lineas


def _flag(db: Session, key: str) -> bool:
    item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return bool(item and item.value == "true")


def _flag_on(db: Session, key: str) -> bool:
    """Flag encendido por defecto: solo un 'false' explícito lo apaga."""
    item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return not (item and item.value == "false")


def _logo_raster(db: Session, max_width: int = LOGO_WIDTH) -> bytes:
    """Convierte el logo (branding.logo, base64) a una imagen raster ESC/POS (GS v 0).

    Devuelve b"" si no hay logo, falta Pillow, o algo falla — nunca rompe la impresión.
    """
    if not _IMG_AVAILABLE:
        return b""
    logo = _branding(db).get("logo")
    if not logo:
        return b""
    try:
        if "," in logo:  # data URL: "data:image/png;base64,...."
            logo = logo.split(",", 1)[1]
        img = Image.open(io.BytesIO(base64.b64decode(logo)))
        # PNG con transparencia: aplastar sobre fondo blanco, si no el alfa
        # se descarta y los píxeles transparentes salen negros en la boleta.
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
            img = Image.alpha_composite(bg, img)
        img = img.convert("L")
        w, h = img.size
        target_w = max(8, (min(max_width, w) // 8) * 8)  # múltiplo de 8
        if target_w != w:
            img = img.resize((target_w, max(1, round(h * target_w / w))))
        img = img.convert("1")  # 1 bit con dithering (Floyd-Steinberg)
        w, h = img.size
        bytes_per_row = w // 8
        px = img.load()
        data = bytearray()
        for y in range(h):
            for bx in range(bytes_per_row):
                byte = 0
                for bit in range(8):
                    if px[bx * 8 + bit, y] == 0:  # 0 = negro
                        byte |= 0x80 >> bit
                data.append(byte)
        header = bytes([
            bytes_per_row & 0xFF, (bytes_per_row >> 8) & 0xFF,
            h & 0xFF, (h >> 8) & 0xFF,
        ])
        return b"\x1d\x76\x30\x00" + header + bytes(data)
    except Exception:
        return b""


def _print_raw(printer_name: str, data: bytes) -> None:
    if not _PRINT_AVAILABLE:
        raise HTTPException(503, "Impresión no disponible en este servidor (falta pywin32)")
    try:
        h = win32print.OpenPrinter(printer_name)
    except Exception as e:
        raise HTTPException(400, f"No se pudo abrir la impresora '{printer_name}': {e}")
    try:
        win32print.StartDocPrinter(h, 1, ("Boleta POS", None, "RAW"))
        win32print.StartPagePrinter(h)
        win32print.WritePrinter(h, bytes(data))
        win32print.EndPagePrinter(h)
        win32print.EndDocPrinter(h)
    finally:
        win32print.ClosePrinter(h)


def _build_receipt(db: Session, sale: Sale, cash_received: float | None) -> bytes:
    branding = _branding(db)
    name = branding.get("name") or "Punto de Venta"
    tagline = branding.get("tagline") or ""
    address = branding.get("address") or ""
    phone = branding.get("phone") or ""
    rut = branding.get("rut") or ""
    footer = branding.get("receipt_footer") or "¡Gracias por su compra!"
    fecha = (sale.created_at or datetime.now()).strftime("%d/%m/%Y %H:%M")
    pago = (sale.payment_method or "efectivo").capitalize()
    seller_name = sale.seller.name if sale.seller else "Sistema"
    n_items = sum(it.quantity for it in sale.items)

    buf = bytearray()
    buf += _INIT + _CANCEL_KANJI + _CHARSET + _LINESPACING

    # ── Logo (opcional) ──
    if _flag(db, "print_logo"):
        logo = _logo_raster(db)
        if logo:
            buf += _CENTER + logo + b"\n"

    # ── Encabezado (centrado) ──
    buf += _CENTER
    buf += _BIG_ON + _BOLD_ON + _txt(name) + b"\n" + _BIG_OFF + _BOLD_OFF
    if tagline:
        buf += _txt(tagline) + b"\n"
    if address:
        buf += _txt(address) + b"\n"
    if phone:
        buf += _txt(f"Tel: {phone}") + b"\n"
    if rut:
        buf += _txt(f"RUT: {rut}") + b"\n"
    buf += b"\n"

    # ── Datos de la venta ──
    buf += _LEFT + _txt(_SEP) + b"\n"
    buf += _txt(_row(f"Doc #{sale.id:06d}", fecha)) + b"\n"
    buf += _txt(_row(f"Vendedor: {seller_name}", f"Pago: {pago}")) + b"\n"
    buf += b"\n"

    # ── Cabecera de columnas + ítems ──
    buf += _BOLD_ON + _txt(_row("CANT  DESCRIPCION", "TOTAL")) + b"\n" + _BOLD_OFF
    buf += _txt(_SUB) + b"\n"
    for it in sale.items:
        nombre = it.product_name[: LINE_WIDTH - 6]
        buf += _txt(f"{it.quantity:<4}  {nombre}") + b"\n"
        buf += _txt(_row(f"      {_money(it.price)} c/u", _money(it.subtotal))) + b"\n"

    buf += _txt(_SUB) + b"\n"
    buf += _txt(_row("Articulos:", str(n_items))) + b"\n"
    buf += b"\n"

    # ── Total (negrita + doble alto) ──
    if (sale.discount_amount or 0) > 0:
        buf += _txt(_row("Subtotal", _money(sale.subtotal or 0))) + b"\n"
        buf += _txt(_row(f"Descuento {sale.discount_percent:g}%", "-" + _money(sale.discount_amount))) + b"\n"
    buf += _TALL_ON + _txt(_row("TOTAL", _money(sale.total))) + b"\n" + _TALL_OFF

    if sale.payment_method == "mixto" and sale.payments:
        for p in sale.payments:
            buf += _txt(_row(f"  {p.method.capitalize()}", _money(p.amount))) + b"\n"

    if sale.payment_method == "efectivo" and cash_received:
        buf += _txt(_row("Recibido", _money(cash_received))) + b"\n"
        buf += _txt(_row("Vuelto", _money(cash_received - sale.total))) + b"\n"

    buf += b"\n" + _txt(_SEP) + b"\n\n"

    # ── Pie (centrado) ──
    # Sin marca de "BOLETA": este ticket no es documento tributario del SII y
    # rotularlo así expone al local. La boleta real la emite la máquina de pago.
    buf += _CENTER
    buf += _txt("COMPROBANTE DE VENTA") + b"\n"
    buf += _txt(footer) + b"\n"
    buf += _FEED_CUT
    return bytes(buf)


def _build_test(db: Session) -> bytes:
    branding = _branding(db)
    name = branding.get("name") or "Punto de Venta"
    buf = bytearray()
    buf += _INIT + _CANCEL_KANJI + _CHARSET + _LINESPACING
    if _flag(db, "print_logo"):
        logo = _logo_raster(db)
        if logo:
            buf += _CENTER + logo + b"\n"
    buf += _CENTER + _BIG_ON + _BOLD_ON + _txt(name) + b"\n" + _BIG_OFF + _BOLD_OFF
    buf += _txt("-" * LINE_WIDTH) + b"\n"
    buf += _txt("PRUEBA DE IMPRESORA") + b"\n"
    buf += _LEFT + _txt(f"Fecha: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}") + b"\n"
    buf += _txt(f"Impresora: {_printer_name(db)}") + b"\n"
    buf += _txt("-" * LINE_WIDTH) + b"\n"
    buf += _CENTER + _txt("Si lees esto, la termica") + b"\n"
    buf += _txt("imprime correctamente!") + b"\n"
    buf += _FEED_CUT
    return bytes(buf)


def build_close_report(db: Session, register) -> bytes:
    """Comprobante de cierre de turno para la térmica.

    Es el papel que las cajeras firman y archivan, y el mismo contenido que le
    llega por correo a la dueña. Además del cuadre, lleva el desglose por
    categoría y el stock que queda: en una cevichería lo que sobró del día es
    justamente lo que hay que saber antes de preparar el lote de mañana.

    Con el turno todavía abierto imprime el mismo resumen en modo parcial (sin
    contado ni diferencia, que solo existen al cerrar): sirve para mirar cómo va
    el día o para cuadrar antes de contar el cajón.
    """
    from ..models import CashMovement, Product, Sale, SaleItem

    branding = _branding(db)
    name = branding.get("name") or "Punto de Venta"
    movs = db.query(CashMovement).filter(CashMovement.register_id == register.id).all()

    def suma(tipo, metodo=None):
        return sum(m.amount for m in movs
                   if m.type == tipo and (metodo is None or m.payment_method == metodo))

    ventas = suma("sale") + suma("void")
    # Defensivo: las cortesías ya no generan movimiento, pero una instalación que
    # venía de antes puede tener alguno de $0 y no debe contar como transacción.
    # Se cuentan ventas distintas (por sale_id): un pago mixto deja un movimiento por
    # método y no debe contarse como varias transacciones.
    ids_venta = {m.sale_id for m in movs if m.type == "sale" and m.payment_method != "cortesia" and m.sale_id}
    ids_anul = {m.sale_id for m in movs if m.type == "void" and m.payment_method != "cortesia" and m.sale_id}
    n_ventas = len(ids_venta) - len(ids_anul)

    abierta = register.status == "open"
    if abierta:
        from .cash import _expected_cash
        esperado = _expected_cash(db, register)
    else:
        esperado = register.expected_amount or 0
    diferencia = (register.closing_amount or 0) - esperado

    q = db.query(Sale).filter(Sale.created_at >= register.opened_at, Sale.status == "completed")
    if register.closed_at:
        q = q.filter(Sale.created_at <= register.closed_at)
    ventas_turno = q.all()
    descuentos = sum(s.discount_amount or 0 for s in ventas_turno)
    cortesias = [s for s in ventas_turno if s.payment_method == "cortesia"]
    valor_cortesias = sum(s.subtotal or 0 for s in cortesias)

    # Desglose por categoría y unidades vendidas por producto
    por_categoria: dict[str, float] = {}
    vendidos: dict[int, float] = {}
    if ventas_turno:
        ids = [s.id for s in ventas_turno]
        # Las cortesías no suman plata: incluirlas dejaría el desglose por
        # categoría por encima del total de ventas. Las unidades sí se cuentan,
        # porque salieron del stock igual.
        cobradas = {s.id for s in ventas_turno if s.payment_method != "cortesia"}
        items = (db.query(SaleItem)
                 .filter(SaleItem.sale_id.in_(ids))
                 .options(joinedload(SaleItem.product)).all())
        for it in items:
            cat = it.product.category if it.product else "otros"
            if it.sale_id in cobradas:
                por_categoria[cat] = por_categoria.get(cat, 0) + it.subtotal
            if it.product_id:
                vendidos[it.product_id] = vendidos.get(it.product_id, 0) + it.quantity

    etiquetas = {c["value"]: c["label"] for c in _categorias(db)}

    buf = bytearray()
    buf += _INIT + _CANCEL_KANJI + _CHARSET + _LINESPACING
    buf += _CENTER
    buf += _BIG_ON + _BOLD_ON + _txt(name) + b"\n" + _BIG_OFF + _BOLD_OFF
    buf += _BOLD_ON + _txt("RESUMEN DEL TURNO" if abierta else "CIERRE DE TURNO") + b"\n" + _BOLD_OFF
    fecha = (register.closed_at or datetime.now()).strftime("%d/%m/%Y %H:%M")
    buf += _txt(fecha) + b"\n"
    if abierta:
        buf += _txt("(turno en curso - parcial)") + b"\n"
    buf += b"\n"

    buf += _LEFT + _txt(_SEP) + b"\n"
    buf += _txt(_row("Apertura", register.opened_at.strftime("%d/%m %H:%M"))) + b"\n"
    if register.opened_by:
        buf += _txt(f"  por {register.opened_by}") + b"\n"
    if register.closed_by:
        buf += _txt(f"Cierre por {register.closed_by}") + b"\n"
    buf += b"\n"

    buf += _BOLD_ON + _txt("VENTAS") + b"\n" + _BOLD_OFF + _txt(_SUB) + b"\n"
    buf += _txt(_row("Transacciones", str(n_ventas))) + b"\n"
    for etiqueta, metodo in (("Efectivo", "efectivo"), ("Tarjeta", "tarjeta"),
                             ("Debito", "debito"), ("Transferencia", "transferencia")):
        monto = suma("sale", metodo) + suma("void", metodo)
        if monto:
            buf += _txt(_row(f"  {etiqueta}", _money(monto))) + b"\n"
    if descuentos:
        buf += _txt(_row("  Descuentos", "-" + _money(descuentos))) + b"\n"
    buf += _TALL_ON + _txt(_row("TOTAL", _money(ventas))) + b"\n" + _TALL_OFF + b"\n"

    if cortesias:
        buf += b"\n" + _BOLD_ON + _txt("CORTESIAS") + b"\n" + _BOLD_OFF + _txt(_SUB) + b"\n"
        buf += _txt(_row(f"{len(cortesias)} entrega(s)", _money(valor_cortesias))) + b"\n"
        for c in cortesias:
            for linea in _wrap(f"  {c.created_at.strftime('%H:%M')} {_money(c.subtotal)} - {c.notes or 'sin motivo'}"):
                buf += _txt(linea) + b"\n"
        buf += b"\n"

    if por_categoria:
        buf += _BOLD_ON + _txt("POR CATEGORIA") + b"\n" + _BOLD_OFF + _txt(_SUB) + b"\n"
        for cat, monto in sorted(por_categoria.items(), key=lambda kv: kv[1], reverse=True):
            buf += _txt(_row(etiquetas.get(cat, cat.capitalize())[:20], _money(monto))) + b"\n"
        buf += b"\n"

    # El remanente solo interesa en lo perecible: cuánto ceviche sobró decide
    # cuánto preparar mañana. Que queden 40 bebidas es ruido. En el resto de las
    # categorías se lista únicamente lo que se vendió.
    con_remanente = set(_json_config(db, "report_stock_categories", []))
    con_stock = (db.query(Product)
                 .filter(Product.active == True, Product.stock.isnot(None))  # noqa: E712
                 .order_by(Product.category, Product.name).all())
    filas = []
    for prod in con_stock:
        vend = vendidos.get(prod.id, 0)
        muestra_queda = not con_remanente or prod.category in con_remanente
        # Sin remanente que mostrar, un producto que no se vendió no aporta nada.
        if muestra_queda and (vend or (prod.stock or 0) > 0):
            filas.append((prod, vend, True))
        elif not muestra_queda and vend:
            filas.append((prod, vend, False))

    if filas:
        titulo = "VENDIDO / QUEDA" if any(m for _, _, m in filas) else "VENDIDO"
        buf += _BOLD_ON + _txt(titulo) + b"\n" + _BOLD_OFF + _txt(_SUB) + b"\n"
        cat_actual = None
        for prod, vend, muestra_queda in filas:
            if prod.category != cat_actual:
                cat_actual = prod.category
                buf += _txt(etiquetas.get(cat_actual, cat_actual.capitalize())) + b"\n"
            derecha = f"{vend:g} / {prod.stock:g}" if muestra_queda else f"{vend:g}"
            buf += _txt(_row(f"  {prod.name[:24]}", derecha)) + b"\n"
        buf += b"\n"

    gastos, retiros, ingresos = suma("expense"), suma("withdrawal"), suma("income")
    # El papel del turno lo maneja quien atiende, y ahí salían los sueldos del local
    # —incluido el suyo—. El correo al dueño sigue trayendo el detalle completo.
    # Ojo: con los gastos ocultos, el esperado ya no se puede recomponer sumando
    # las líneas de arriba (los gastos en efectivo igual salieron del cajón).
    if not _flag_on(db, "report_show_expenses"):
        gastos = 0
    if gastos or retiros or ingresos:
        buf += _BOLD_ON + _txt("MOVIMIENTOS DE CAJA") + b"\n" + _BOLD_OFF + _txt(_SUB) + b"\n"
        if gastos:
            buf += _txt(_row("Gastos", "-" + _money(gastos))) + b"\n"
        if retiros:
            buf += _txt(_row("Retiros", "-" + _money(retiros))) + b"\n"
        if ingresos:
            buf += _txt(_row("Ingresos", "+" + _money(ingresos))) + b"\n"
        buf += b"\n"

    buf += _BOLD_ON + _txt("CUADRE DE EFECTIVO") + b"\n" + _BOLD_OFF + _txt(_SUB) + b"\n"
    buf += _txt(_row("Monto inicial", _money(register.opening_amount))) + b"\n"
    if abierta:
        buf += _TALL_ON + _txt(_row("ESPERADO EN CAJON", _money(esperado))) + b"\n" + _TALL_OFF
    else:
        buf += _txt(_row("Esperado", _money(esperado))) + b"\n"
        buf += _txt(_row("Contado", _money(register.closing_amount))) + b"\n"
        signo = "+" if diferencia >= 0 else "-"
        buf += _TALL_ON + _txt(_row("DIFERENCIA", f"{signo}{_money(abs(diferencia))}")) + b"\n" + _TALL_OFF

    if register.notes:
        buf += b"\n" + _txt(_SUB) + b"\n" + _txt("Observaciones:") + b"\n"
        for linea in _wrap(register.notes):
            buf += _txt(linea) + b"\n"

    buf += b"\n" + _txt(_SEP) + b"\n"
    if not abierta:
        buf += _CENTER + _txt("Firma: ______________________") + b"\n"
    buf += _FEED_CUT
    return bytes(buf)


@router.post("/cash-close")
def print_cash_close(
    register_id: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_permission("can_close_cash")),
):
    """Imprime (o reimprime) el resumen del turno. Sin register_id usa la caja
    abierta y, si no hay, el último turno cerrado — el mismo criterio que el
    resumen por correo."""
    from ..models import CashRegister
    if register_id:
        register = db.query(CashRegister).filter(CashRegister.id == register_id).first()
    else:
        register = db.query(CashRegister).filter(CashRegister.status == "open").first()
        if not register:
            register = (db.query(CashRegister).filter(CashRegister.status == "closed")
                        .order_by(CashRegister.closed_at.desc()).first())
    if not register:
        raise HTTPException(404, "No hay ningún turno para imprimir")
    _print_raw(_printer_name(db), build_close_report(db, register))
    return {"ok": True}


@router.post("/receipt")
def print_receipt(
    payload: PrintReceiptRequest,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    sale = db.query(Sale).filter(Sale.id == payload.sale_id).first()
    if not sale:
        raise HTTPException(404, "Venta no encontrada")
    _print_raw(_printer_name(db), _build_receipt(db, sale, payload.cash_received))
    return {"ok": True}


@router.post("/open-drawer")
def open_drawer(db: Session = Depends(get_db), _=Depends(get_current_seller)):
    """Abre el cajón de dinero conectado a la impresora (pulso ESC p).

    Lo dispara el POS al confirmar una venta con efectivo. No imprime nada:
    solo manda el pulso. Cualquier vendedor autenticado puede — es la misma
    cajera que necesita dar vuelto."""
    _print_raw(_printer_name(db), _KICK_DRAWER)
    return {"ok": True}


@router.post("/test")
def print_test(db: Session = Depends(get_db), _=Depends(require_admin)):
    _print_raw(_printer_name(db), _build_test(db))
    return {"ok": True}
