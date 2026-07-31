from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister, Expense, ExpenseCategory, Supplier
from ..auth import get_current_seller, require_admin
from ..audit import ACTIONS, log_action
from ._common import parse_date_from, parse_date_to
from ..schemas import (
    ExpenseCategoryCreate, ExpenseCategoryOut, ExpenseCategoryUpdate,
    ExpenseCreate, ExpenseOut, ExpenseUpdate,
)

router = APIRouter(tags=["expenses"])


# ── Expense Categories ────────────────────────────────────────────────────────

@router.get("/expense-categories", response_model=list[ExpenseCategoryOut])
def list_categories(db: Session = Depends(get_db), _=Depends(get_current_seller)):
    return (
        db.query(ExpenseCategory)
        .filter(ExpenseCategory.active == True)
        .order_by(ExpenseCategory.name)
        .all()
    )


@router.post("/expense-categories", response_model=ExpenseCategoryOut, status_code=201)
def create_category(
    payload: ExpenseCategoryCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    cat = ExpenseCategory(name=payload.name, description=payload.description)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    log_action(db, ACTIONS.EXPENSE_CATEGORY_CREATED, admin.id, f"Categoría creada: {cat.name}")
    return cat


@router.patch("/expense-categories/{category_id}", response_model=ExpenseCategoryOut)
def update_category(
    category_id: int,
    payload: ExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    log_action(db, ACTIONS.EXPENSE_CATEGORY_UPDATED, admin.id, f"Categoría actualizada: {cat.name}")
    return cat


# ── Expenses ──────────────────────────────────────────────────────────────────

# ── Reflejo en caja ───────────────────────────────────────────────────────────

def _open_register(db: Session) -> CashRegister | None:
    return db.query(CashRegister).filter(CashRegister.status == "open").first()


def _sync_cash_movement(db: Session, expense: Expense, seller_id: int | None = None) -> None:
    """Mantiene el movimiento de caja que refleja un gasto pagado en efectivo.

    Un gasto en efectivo sale del cajón: si no se descuenta, el cierre aparece con
    un faltante igual a lo gastado y nadie entiende por qué. Al revés, registrarlo
    solo en Caja lo dejaba fuera de Contabilidad. El gasto es la fuente de verdad
    y el movimiento es su reflejo.

    Solo se toca el movimiento si su caja sigue abierta: reescribir un turno ya
    cerrado cambiaría un cierre que alguien firmó."""
    movement = db.query(CashMovement).filter(CashMovement.expense_id == expense.id).first()
    es_efectivo = expense.payment_method == "efectivo"

    if movement is not None:
        if movement.register.status != "open":
            return  # turno cerrado: se respeta lo que quedó registrado
        if not es_efectivo:
            db.delete(movement)
        else:
            movement.amount = expense.amount
            movement.description = expense.description or "Gasto"
        return

    if not es_efectivo:
        return
    register = _open_register(db)
    if register is None:
        return  # sin caja abierta no hay cajón que descontar (el front avisa)
    db.add(CashMovement(
        register_id=register.id,
        type="expense",
        amount=expense.amount,
        description=expense.description or "Gasto",
        payment_method="efectivo",
        expense_id=expense.id,
        seller_id=seller_id if seller_id is not None else expense.seller_id,
    ))


def _unlink_cash_movement(db: Session, expense: Expense) -> None:
    """Al borrar un gasto revierte su movimiento si la caja sigue abierta; si el
    turno ya cerró, solo corta el vínculo para no alterar un cierre pasado."""
    movement = db.query(CashMovement).filter(CashMovement.expense_id == expense.id).first()
    if movement is None:
        return
    if movement.register.status == "open":
        db.delete(movement)
    else:
        movement.expense_id = None


def _expense_to_out(e: Expense) -> ExpenseOut:
    return ExpenseOut(
        id=e.id,
        category_id=e.category_id,
        category_name=e.category.name if e.category else "Sin categoría",
        amount=e.amount,
        description=e.description,
        receipt_photo=e.receipt_photo,
        document_type=e.document_type or 'boleta',
        seller_id=e.seller_id,
        seller_name=e.seller.name if e.seller else "Desconocido",
        supplier_id=e.supplier_id,
        supplier_name=e.supplier.name if e.supplier else None,
        payment_method=e.payment_method,
        has_items=len(e.purchase_items) > 0,
        created_at=e.created_at,
    )


@router.get("/expenses", response_model=list[ExpenseOut])
def list_expenses(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    category_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    limit: int = Query(100, ge=1, le=300),
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    q = db.query(Expense).options(
        joinedload(Expense.category), joinedload(Expense.seller),
        joinedload(Expense.supplier), joinedload(Expense.purchase_items)
    )
    dt_from = parse_date_from(date_from)
    dt_to = parse_date_to(date_to)
    if dt_from:
        q = q.filter(Expense.created_at >= dt_from)
    if dt_to:
        q = q.filter(Expense.created_at <= dt_to)
    if category_id:
        q = q.filter(Expense.category_id == category_id)
    if supplier_id:
        q = q.filter(Expense.supplier_id == supplier_id)
    expenses = q.order_by(Expense.created_at.desc()).offset(offset).limit(limit).all()
    return [_expense_to_out(e) for e in expenses]


@router.post("/expenses", response_model=ExpenseOut, status_code=201)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    category = db.query(ExpenseCategory).filter(ExpenseCategory.id == payload.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    if payload.supplier_id is not None:
        supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    expense = Expense(
        category_id=payload.category_id,
        amount=payload.amount,
        description=payload.description,
        receipt_photo=payload.receipt_photo,
        document_type=payload.document_type,
        seller_id=seller.id,
        supplier_id=payload.supplier_id,
        payment_method=payload.payment_method,
    )
    db.add(expense)
    db.flush()          # necesitamos el id para vincular el movimiento de caja
    _sync_cash_movement(db, expense, seller.id)
    db.commit()
    db.refresh(expense)
    log_action(db, ACTIONS.EXPENSE_CREATED, seller.id,
               f"Gasto ${payload.amount:.0f} ({payload.document_type}) en {category.name}: {payload.description or ''}")

    return _expense_to_out(expense)


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category), joinedload(Expense.seller))
        .filter(Expense.id == expense_id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(expense, field, value)
    _sync_cash_movement(db, expense)
    db.commit()
    db.refresh(expense)
    log_action(db, ACTIONS.EXPENSE_UPDATED, admin.id, f"Gasto #{expense_id} actualizado")
    return _expense_to_out(expense)


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    _unlink_cash_movement(db, expense)
    db.delete(expense)
    db.commit()
    log_action(db, ACTIONS.EXPENSE_DELETED, admin.id, f"Gasto #{expense_id} eliminado")
