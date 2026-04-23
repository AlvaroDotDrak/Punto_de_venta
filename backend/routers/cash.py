from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister
from ..auth import get_current_seller, require_admin
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

    register = CashRegister(opening_amount=payload.opening_amount, status="open")
    db.add(register)
    db.commit()
    db.refresh(register)
    log_action(db, ACTIONS.CASH_OPEN, seller.id, f"Caja abierta con ${payload.opening_amount:.0f}")
    return register


@router.post("/close", response_model=CashRegisterOut)
def close_register(
    payload: CashCloseRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    register = _get_open_register(db)

    # Calcular monto esperado: apertura + ventas efectivo + ingresos efectivo - gastos - anulaciones
    movements = db.query(CashMovement).filter(
        CashMovement.register_id == register.id,
        CashMovement.payment_method == "efectivo",
    ).all()

    expected = register.opening_amount
    for m in movements:
        expected += m.amount  # ventas y anulaciones ya incluyen signo

    # Gastos e ingresos manuales sin método de pago (se asumen efectivo)
    manual = db.query(CashMovement).filter(
        CashMovement.register_id == register.id,
        CashMovement.payment_method == None,
        CashMovement.type.in_(["expense", "income"]),
    ).all()
    for m in manual:
        expected += m.amount if m.type == "income" else -m.amount

    register.closed_at = datetime.now()
    register.closing_amount = payload.closing_amount
    register.expected_amount = expected
    register.notes = payload.notes
    register.status = "closed"

    db.commit()
    log_action(db, ACTIONS.CASH_CLOSE, admin.id,
               f"Caja cerrada. Esperado: ${expected:.0f} | Real: ${payload.closing_amount:.0f}")

    return db.query(CashRegister).options(
        joinedload(CashRegister.movements)
    ).filter(CashRegister.id == register.id).first()


@router.post("/movements", response_model=CashMovementOut, status_code=201)
def add_movement(
    payload: CashMovementCreate,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
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
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    log_action(db, ACTIONS.CASH_MOVEMENT, seller.id,
               f"Movimiento {payload.type}: ${payload.amount:.0f} ({payload.payment_method or 'sin método'})")
    return movement
