from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister
from ..auth import get_current_seller, require_permission
from ..audit import ACTIONS, log_action
from ..schemas import (
    CashCloseRequest, CashMovementCreate, CashMovementOut,
    CashOpenRequest, CashRegisterOut,
)

router = APIRouter(prefix="/cash", tags=["cash"])

VALID_PAYMENT_METHODS = {"efectivo", "tarjeta", "transferencia"}


def _get_open_register(db: Session) -> CashRegister:
    register = db.query(CashRegister).filter(CashRegister.status == "open").first()
    if not register:
        raise HTTPException(status_code=400, detail="No hay caja abierta")
    return register


def _expected_cash(db: Session, register: CashRegister) -> float:
    """Efectivo físico esperado al cierre.

    Solo los movimientos en efectivo afectan la caja (los manuales sin método se
    asumen efectivo). Signo por tipo: venta/ingreso suman, gasto resta, anulación
    ya viene con monto negativo. Tarjeta y transferencia no tocan el efectivo.
    """
    movements = db.query(CashMovement).filter(
        CashMovement.register_id == register.id,
    ).all()
    expected = register.opening_amount
    for m in movements:
        is_cash = m.payment_method == "efectivo" or (
            m.payment_method is None and m.type in ("expense", "income")
        )
        if not is_cash:
            continue
        if m.type == "expense":
            expected -= m.amount
        else:
            expected += m.amount  # sale, income (positivos); void (ya negativo)
    return expected


@router.get("/current", response_model=CashRegisterOut | None)
def get_current_register(db: Session = Depends(get_db), _=Depends(get_current_seller)):
    return (
        db.query(CashRegister)
        .options(joinedload(CashRegister.movements))
        .filter(CashRegister.status == "open")
        .first()
    )


@router.get("/history", response_model=list[CashRegisterOut])
def get_history(
    limit: int = 30,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    """Retorna las últimas cajas cerradas, sin movimientos (para listado rápido)."""
    return (
        db.query(CashRegister)
        .filter(CashRegister.status == "closed")
        .order_by(CashRegister.closed_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/history/{register_id}", response_model=CashRegisterOut)
def get_history_detail(
    register_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
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
    return reg


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

    return db.query(CashRegister).options(
        joinedload(CashRegister.movements)
    ).filter(CashRegister.id == register.id).first()


@router.post("/movements", response_model=CashMovementOut, status_code=201)
def add_movement(
    payload: CashMovementCreate,
    db: Session = Depends(get_db),
    seller=Depends(require_permission("can_cash_movements")),
):
    if payload.type not in ("expense", "income"):
        raise HTTPException(status_code=422, detail="Tipo debe ser 'expense' o 'income'")
    if payload.payment_method and payload.payment_method not in VALID_PAYMENT_METHODS:
        raise HTTPException(status_code=422, detail="Método de pago inválido")

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
