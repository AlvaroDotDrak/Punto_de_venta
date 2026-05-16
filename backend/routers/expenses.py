from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Expense, ExpenseCategory
from ..auth import get_current_seller, require_admin
from ..audit import ACTIONS, log_action
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
        created_at=e.created_at,
    )


@router.get("/expenses", response_model=list[ExpenseOut])
def list_expenses(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    category_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    q = db.query(Expense).options(
        joinedload(Expense.category), joinedload(Expense.seller)
    )
    if date_from:
        q = q.filter(Expense.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(Expense.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))
    if category_id:
        q = q.filter(Expense.category_id == category_id)
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

    expense = Expense(
        category_id=payload.category_id,
        amount=payload.amount,
        description=payload.description,
        receipt_photo=payload.receipt_photo,
        document_type=payload.document_type,
        seller_id=seller.id,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    log_action(db, ACTIONS.EXPENSE_CREATED, seller.id,
               f"Gasto ${payload.amount:.0f} ({payload.document_type}) en {category.name}: {payload.description or ''}")

    return ExpenseOut(
        id=expense.id,
        category_id=expense.category_id,
        category_name=category.name,
        amount=expense.amount,
        description=expense.description,
        receipt_photo=expense.receipt_photo,
        document_type=expense.document_type,
        seller_id=expense.seller_id,
        seller_name=seller.name,
        created_at=expense.created_at,
    )


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
    db.delete(expense)
    db.commit()
    log_action(db, ACTIONS.EXPENSE_DELETED, admin.id, f"Gasto #{expense_id} eliminado")
