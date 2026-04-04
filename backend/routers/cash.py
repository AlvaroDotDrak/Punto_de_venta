from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister
from ..auth import get_current_seller
from ..audit import ACTIONS, log_action
from ..schemas import (
    CashCloseRequest, CashMovementCreate, CashMovementOut,
    CashOpenRequest, CashRegisterOut,
)

router = APIRouter(prefix="/cash", tags=["cash"])


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
    seller=Depends(get_current_seller),
):
    register = _get_open_register(db)

    # Calcular monto esperado: apertura + ventas efectivo + ingresos - gastos - anulaciones
    movements = db.query(CashMovement).filter(
        CashMovement.register_id == register.id,
        CashMovement.payment_method == "efectivo",
    ).all()

    expected = register.opening_amount
    for m in movements:
        expected += m.amount  # ventas y anulaciones ya incluyen signo

    # Gastos e ingresos manuales (sin payment_method)
    manual = db.query(CashMovement).filter(
        CashMovement.register_id == register.id,
        CashMovement.payment_method == None,
        CashMovement.type.in_(["expense", "income"]),
    ).all()
    for m in manual:
        expected += m.amount if m.type == "income" else -m.amount

    register.closed_at = datetime.utcnow()
    register.closing_amount = payload.closing_amount
    register.expected_amount = expected
    register.status = "closed"

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
    seller=Depends(get_current_seller),
):
    if payload.type not in ("expense", "income"):
        raise HTTPException(status_code=422, detail="Tipo debe ser 'expense' o 'income'")

    register = _get_open_register(db)
    movement = CashMovement(
        register_id=register.id,
        type=payload.type,
        amount=payload.amount,
        description=payload.description,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    log_action(db, ACTIONS.CASH_MOVEMENT, seller.id,
               f"Movimiento {payload.type}: ${payload.amount:.0f}")
    return movement
