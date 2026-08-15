from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister
from ..auth import get_current_seller, require_permission
from ..audit import ACTIONS, log_action
from ..mailer import (send_close_summary_async, get_mail_config, is_configured,
                      build_summary, send_mail, backup_attachment)
from ..schemas import (
    CashCloseRequest, CashMovementCreate, CashMovementOut,
    CashOpenRequest, CashRegisterOut,
)

router = APIRouter(prefix="/cash", tags=["cash"])

def _get_flag(db: Session, key: str, default: bool = False) -> bool:
    from ..models import SystemConfig
    item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if item is None or item.value is None:
        return default
    return item.value == "true"


def _can_view_totals(seller) -> bool:
    return seller.role in ("admin", "dev") or bool(getattr(seller, "can_view_totals", False))


def _visible(register: CashRegister | None, seller, db: Session | None = None) -> CashRegisterOut | None:
    """Recorta los movimientos que no son efectivo para quien no puede ver los
    totales del negocio. Se filtra acá y no en el frontend: esconder la tarjeta
    en pantalla dejaría el detalle a la vista en la respuesta de la API.

    En una caja abierta rellena expected_amount con el efectivo esperado al
    momento, para que el frontend no tenga que recalcularlo por su cuenta."""
    if register is None:
        return None
    out = CashRegisterOut.model_validate(register)
    if db is not None and register.status == "open":
        out.expected_amount = _expected_cash(db, register)
    if not _can_view_totals(seller):
        out.movements = [
            m for m in out.movements
            if m.payment_method == "efectivo" or m.payment_method is None
        ]
    return out


def _get_open_register(db: Session) -> CashRegister:
    register = db.query(CashRegister).filter(CashRegister.status == "open").first()
    if not register:
        raise HTTPException(status_code=400, detail="No hay caja abierta")
    return register


def _expected_cash(db: Session, register: CashRegister) -> float:
    """Efectivo físico esperado al cierre.

    Solo los movimientos en efectivo afectan la caja (los manuales sin método se
    asumen efectivo). Signo por tipo: venta/ingreso suman, gasto y retiro restan,
    anulación ya viene con monto negativo. Tarjeta y transferencia no tocan el
    efectivo.
    """
    movements = db.query(CashMovement).filter(
        CashMovement.register_id == register.id,
    ).all()
    expected = register.opening_amount
    for m in movements:
        is_cash = m.payment_method == "efectivo" or (
            m.payment_method is None and m.type in ("expense", "income", "withdrawal")
        )
        if not is_cash:
            continue
        if m.type in ("expense", "withdrawal"):
            expected -= m.amount
        else:
            expected += m.amount  # sale, income (positivos); void (ya negativo)
    return expected


@router.get("/current", response_model=CashRegisterOut | None)
def get_current_register(db: Session = Depends(get_db), seller=Depends(get_current_seller)):
    register = (
        db.query(CashRegister)
        .options(joinedload(CashRegister.movements))
        .filter(CashRegister.status == "open")
        .first()
    )
    return _visible(register, seller, db)


@router.get("/history", response_model=list[CashRegisterOut])
def get_history(
    limit: int = Query(30, ge=1, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(require_permission("can_close_cash")),
):
    """Retorna las cajas cerradas, sin movimientos (para listado rápido).

    Requiere can_close_cash: el historial expone las diferencias de cierre de
    todos los turnos, no es información para cualquier vendedor."""
    return (
        db.query(CashRegister)
        .filter(CashRegister.status == "closed")
        .order_by(CashRegister.closed_at.desc())
        .offset(max(0, offset))
        .limit(limit)
        .all()
    )


@router.get("/history/{register_id}", response_model=CashRegisterOut)
def get_history_detail(
    register_id: int,
    db: Session = Depends(get_db),
    seller=Depends(require_permission("can_close_cash")),
):
    """Retorna una caja cerrada con todos sus movimientos."""
    reg = (
        db.query(CashRegister)
        .options(joinedload(CashRegister.movements))
        .filter(CashRegister.id == register_id)
        .first()
    )
    if not reg:
        raise HTTPException(status_code=404, detail="Caja no encontrada")
    return _visible(reg, seller)


@router.post("/open", response_model=CashRegisterOut, status_code=201)
def open_register(
    payload: CashOpenRequest,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    existing = db.query(CashRegister).filter(CashRegister.status == "open").first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya hay una caja abierta")

    register = CashRegister(opening_amount=payload.opening_amount, status="open", opened_by=seller.name)
    db.add(register)
    db.commit()
    db.refresh(register)
    log_action(db, ACTIONS.CASH_OPEN, seller.id, f"Caja abierta con ${payload.opening_amount:.0f}")
    return register


@router.post("/close", response_model=CashRegisterOut)
def close_register(
    payload: CashCloseRequest,
    db: Session = Depends(get_db),
    seller=Depends(require_permission("can_close_cash")),
):
    register = _get_open_register(db)

    expected = _expected_cash(db, register)

    register.closed_at = datetime.now()
    register.closing_amount = payload.closing_amount
    register.expected_amount = expected
    register.notes = payload.notes
    register.status = "closed"
    register.closed_by = seller.name

    db.commit()
    log_action(db, ACTIONS.CASH_CLOSE, seller.id,
               f"Caja cerrada. Esperado: ${expected:.0f} | Real: ${payload.closing_amount:.0f}")

    # En segundo plano: si el correo falla (sin internet, credenciales malas), el
    # cierre ya quedó guardado igual.
    send_close_summary_async(register.id)

    # Mismo criterio con la impresora: si no hay papel, está apagada o el equipo
    # no es Windows, el turno ya cerró. Se puede reimprimir desde Caja.
    # Flag propio y encendido por defecto: colgarlo de `auto_print` (la boleta de
    # cada venta, que muchos locales tienen apagada) dejaba el comprobante de
    # cierre sin imprimir sin que nadie supiera por qué.
    # Se guarda el id aparte: imprimir suelta la sesión (ver _print_and_release),
    # lo que deja a `register` desconectado y sin poder recargar sus columnas.
    register_id = register.id

    print_error = None
    if _get_flag(db, "auto_print_close", default=True):
        try:
            from .printing import build_close_report, _print_and_release
            _print_and_release(db, build_close_report(db, register))
        except Exception as e:  # noqa: BLE001
            print_error = str(getattr(e, "detail", None) or e)
            print(f"[printing] No se pudo imprimir el cierre de la caja {register_id}: {e}")

    out = _visible(db.query(CashRegister).options(
        joinedload(CashRegister.movements)
    ).filter(CashRegister.id == register_id).first(), seller)
    out.print_error = print_error
    return out


@router.post("/report/send")
def send_report_now(
    register_id: int | None = None,
    db: Session = Depends(get_db),
    admin=Depends(require_permission("can_close_cash")),
):
    """Envía el resumen a mano: para probar la configuración o para mirar cómo va
    el día sin estar en el local. Sin `register_id` usa la caja abierta; si no hay,
    la última cerrada."""
    cfg = get_mail_config(db)
    if not is_configured(cfg):
        raise HTTPException(status_code=400, detail="Falta indicar a qué correos se envía el resumen")

    if register_id:
        register = db.query(CashRegister).filter(CashRegister.id == register_id).first()
    else:
        register = (db.query(CashRegister).filter(CashRegister.status == "open").first()
                    or db.query(CashRegister).order_by(CashRegister.closed_at.desc()).first())
    if not register:
        raise HTTPException(status_code=404, detail="No hay ninguna caja para reportar")

    asunto, html = build_summary(db, register)
    try:
        send_mail(cfg, asunto, html, backup_attachment(db))
    except Exception as e:  # noqa: BLE001 — el error de SMTP se muestra tal cual al admin
        raise HTTPException(status_code=502, detail=f"No se pudo enviar: {e}")

    log_action(db, ACTIONS.REPORT_SENT, admin.id, f"Resumen de la caja #{register.id} enviado a {', '.join(cfg['recipients'])}")
    return {"ok": True, "recipients": cfg["recipients"]}


@router.post("/movements", response_model=CashMovementOut, status_code=201)
def add_movement(
    payload: CashMovementCreate,
    db: Session = Depends(get_db),
    seller=Depends(require_permission("can_cash_movements")),
):
    """Movimientos manuales del cajón: ingreso de efectivo y retiro (sangría).

    Los gastos NO se registran acá: van por /expenses, que además pide categoría
    y comprobante, y desde allí se refleja el movimiento de caja. Un retiro no es
    un gasto — la plata sigue siendo del negocio, solo cambió de lugar — por eso
    nunca llega a Contabilidad."""
    if payload.type not in ("income", "withdrawal"):
        raise HTTPException(status_code=422, detail="Tipo debe ser 'income' o 'withdrawal'")
    if payload.type == "withdrawal" and not (
        seller.role in ("admin", "dev") or seller.can_withdraw_cash
    ):
        raise HTTPException(status_code=403, detail="Sin permisos para retirar efectivo")
    if payload.type == "withdrawal" and not (payload.description or "").strip():
        raise HTTPException(status_code=422, detail="El retiro necesita una descripción (a dónde va el dinero)")

    register = _get_open_register(db)
    movement = CashMovement(
        register_id=register.id,
        type=payload.type,
        amount=payload.amount,
        description=payload.description,
        payment_method=payload.payment_method or None,
        seller_id=seller.id,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    log_action(db, ACTIONS.CASH_MOVEMENT, seller.id,
               f"Movimiento {payload.type}: ${payload.amount:.0f} ({payload.payment_method or 'sin método'})")
    return movement


@router.delete("/movements/{movement_id}", status_code=204)
def delete_movement(
    movement_id: int,
    db: Session = Depends(get_db),
    seller=Depends(require_permission("can_cash_movements")),
):
    """Borra un movimiento manual mal ingresado (un cero de más en el monto deja
    el cierre descuadrado y no había forma de corregirlo).

    Solo movimientos manuales: los de tipo 'sale'/'void' son el reflejo de una
    venta y borrarlos desincronizaría la caja de las ventas — esos se corrigen
    anulando la venta. Solo en la caja abierta: reescribir un turno ya cerrado
    invalidaría su cierre. El detalle queda en el audit log."""
    movement = db.query(CashMovement).filter(CashMovement.id == movement_id).first()
    if not movement:
        raise HTTPException(status_code=404, detail="Movimiento no encontrado")
    if movement.expense_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Este movimiento viene de un gasto. Elimina el gasto y el movimiento se revierte solo.",
        )
    if movement.type not in ("income", "withdrawal"):
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden borrar movimientos manuales. Para corregir una venta, anúlala.",
        )

    register = _get_open_register(db)
    if movement.register_id != register.id:
        raise HTTPException(status_code=400, detail="El movimiento pertenece a una caja ya cerrada")

    detalle = (f"Movimiento #{movement.id} eliminado: {movement.type} "
               f"${movement.amount:.0f} — {movement.description or 'sin descripción'}")
    db.delete(movement)
    db.commit()
    log_action(db, ACTIONS.CASH_MOVEMENT, seller.id, detalle)
