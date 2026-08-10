from datetime import datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister, Expense, ExpenseCategory, Supplier
from ..auth import get_current_seller, require_permission
from ..audit import ACTIONS, log_action
from ._common import parse_date_from, parse_date_to
from ..schemas import (
    ExpenseCategoryCreate, ExpenseCategoryOut, ExpenseCategoryUpdate,
    ExpenseCreate, ExpenseOut, ExpenseUpdate,
)

router = APIRouter(tags=["expenses"])

require_manage = require_permission("can_manage_expenses")


def _can_see_history(seller) -> bool:
    """Quien puede editar gastos viejos necesita verlos, así que `can_manage_expenses`
    ya implica el historial: pedir los dos permisos por separado solo lograría
    encargados con la pantalla en blanco."""
    return (
        seller.role in ("admin", "dev")
        or seller.can_manage_expenses
        or seller.can_view_expense_history
    )


def _guard_purchase(expense: Expense, seller) -> None:
    """Un gasto con líneas es una factura de compra: borrarla desde acá no revierte
    el stock ni los costos que movió (eso lo hace DELETE /purchases). Se le deja
    solo al admin, que además tiene la pantalla de Compras para hacerlo bien."""
    if expense.purchase_items and seller.role not in ("admin", "dev"):
        raise HTTPException(
            status_code=403,
            detail="Es una factura de compra: solo un administrador puede modificarla desde Compras",
        )


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
    seller=Depends(require_manage),
):
    cat = ExpenseCategory(name=payload.name, description=payload.description)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    log_action(db, ACTIONS.EXPENSE_CATEGORY_CREATED, seller.id, f"Categoría creada: {cat.name}")
    return cat


@router.patch("/expense-categories/{category_id}", response_model=ExpenseCategoryOut)
def update_category(
    category_id: int,
    payload: ExpenseCategoryUpdate,
    db: Session = Depends(get_db),
    seller=Depends(require_manage),
):
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    db.commit()
    db.refresh(cat)
    log_action(db, ACTIONS.EXPENSE_CATEGORY_UPDATED, seller.id, f"Categoría actualizada: {cat.name}")
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
    # affects_cash=False → se pagó en billetes, pero no del cajón del local (un
    # sueldo, la feria del mes). Es gasto para Contabilidad y no toca el arqueo.
    es_efectivo = expense.payment_method == "efectivo" and expense.affects_cash is not False

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
    if expense.created_at and expense.created_at < register.opened_at:
        # El gasto es de un turno anterior: pasarlo a efectivo hoy no puede
        # descontar del cajón de hoy. La plata salió en su día; cargarla acá
        # dejaría este cierre con un faltante que nadie sabría explicar.
        return
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


def _cash_warning(db: Session, expense: Expense) -> str | None:
    """Avisa si el gasto dejó el cajón en negativo.

    Un cajón no puede tener plata negativa: si el esperado da bajo cero, es que se
    cargaron salidas que no salieron de ahí. Aceptarlo en silencio fue lo que dejó
    un arqueo real en -$1.135.690 sin que nadie lo notara hasta el cierre.
    """
    if expense.payment_method != "efectivo" or expense.affects_cash is False:
        return None
    register = _open_register(db)
    if register is None:
        return None
    from .cash import _expected_cash
    esperado = _expected_cash(db, register)
    if esperado >= 0:
        return None
    monto = f"{abs(esperado):,.0f}".replace(",", ".")
    return (
        f"El efectivo esperado en el cajón quedó en -${monto}. "
        "Si esta plata no salió del cajón, marcá el gasto como pagado con plata de otro lado."
    )


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
        affects_cash=e.affects_cash is not False,
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
    seller=Depends(get_current_seller),
):
    q = db.query(Expense).options(
        joinedload(Expense.category), joinedload(Expense.seller),
        joinedload(Expense.supplier), joinedload(Expense.purchase_items)
    )
    dt_from = parse_date_from(date_from)
    dt_to = parse_date_to(date_to)

    # Sin permiso, un vendedor solo ve el día en curso. Limitarlo solo en pantalla
    # dejaba el histórico completo del negocio a un fetch de distancia.
    if not _can_see_history(seller):
        hoy = datetime.now().date()
        dt_from = datetime.combine(hoy, time.min)
        dt_to = datetime.combine(hoy, time.max)
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
        affects_cash=payload.affects_cash,
    )
    db.add(expense)
    db.flush()          # necesitamos el id para vincular el movimiento de caja
    _sync_cash_movement(db, expense, seller.id)
    db.commit()
    db.refresh(expense)
    origen = "" if expense.affects_cash is not False else " (no sale del cajón)"
    log_action(db, ACTIONS.EXPENSE_CREATED, seller.id,
               f"Gasto ${payload.amount:.0f} ({payload.document_type}) en {category.name}{origen}: {payload.description or ''}")

    out = _expense_to_out(expense)
    out.cash_warning = _cash_warning(db, expense)
    return out


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    seller=Depends(require_manage),
):
    expense = (
        db.query(Expense)
        .options(joinedload(Expense.category), joinedload(Expense.seller))
        .filter(Expense.id == expense_id)
        .first()
    )
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    _guard_purchase(expense, seller)

    if payload.category_id is not None:
        category = db.query(ExpenseCategory).filter(ExpenseCategory.id == payload.category_id).first()
        if not category:
            raise HTTPException(status_code=404, detail="Categoría no encontrada")
    if payload.supplier_id is not None:
        supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # exclude_unset (no exclude_none): mandar null es la única forma de dejar un
    # gasto sin proveedor o sin descripción. Los campos que no admiten null se filtran.
    data = payload.model_dump(exclude_unset=True)
    for field in ("category_id", "amount", "document_type"):
        if field in data and data[field] is None:
            data.pop(field)
    for field, value in data.items():
        setattr(expense, field, value)

    _sync_cash_movement(db, expense)   # el movimiento sigue siendo del autor del gasto
    db.commit()
    db.refresh(expense)
    log_action(db, ACTIONS.EXPENSE_UPDATED, seller.id, f"Gasto #{expense_id} actualizado")
    out = _expense_to_out(expense)
    out.cash_warning = _cash_warning(db, expense)
    return out


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    seller=Depends(require_manage),
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Gasto no encontrado")
    _guard_purchase(expense, seller)
    _unlink_cash_movement(db, expense)
    db.delete(expense)
    db.commit()
    log_action(db, ACTIONS.EXPENSE_DELETED, seller.id, f"Gasto #{expense_id} eliminado")
