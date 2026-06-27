from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import (
    Expense, ExpenseCategory, Supplier, Product, Ingredient,
    IngredientMovement, PurchaseItem,
)
from ..auth import require_admin
from ..audit import ACTIONS, log_action
from ..schemas import PurchaseCreate, PurchaseOut, PurchaseItemOut, CostHistoryEntry

router = APIRouter(tags=["purchases"])

IVA_RATE = 0.19


def _item_to_out(it: PurchaseItem, header_category_name: str) -> PurchaseItemOut:
    return PurchaseItemOut(
        id=it.id,
        product_id=it.product_id,
        ingredient_id=it.ingredient_id,
        category_id=it.category_id,
        # Si la línea no tiene categoría propia, hereda la de la factura.
        category_name=(it.category.name if it.category else header_category_name),
        description=it.description,
        quantity=it.quantity,
        unit_cost=it.unit_cost,
        line_total=it.line_total,
    )


def _purchase_to_out(e: Expense) -> PurchaseOut:
    net = sum(it.line_total for it in e.purchase_items)
    total = e.amount
    header_category_name = e.category.name if e.category else "Sin categoría"
    return PurchaseOut(
        id=e.id,
        category_id=e.category_id,
        category_name=header_category_name,
        supplier_id=e.supplier_id,
        supplier_name=e.supplier.name if e.supplier else None,
        document_type=e.document_type or 'factura',
        payment_method=e.payment_method,
        description=e.description,
        net_amount=round(net),
        tax_amount=round(total - net),
        total_amount=round(total),
        seller_name=e.seller.name if e.seller else "Desconocido",
        created_at=e.created_at,
        items=[_item_to_out(it, header_category_name) for it in e.purchase_items],
    )


@router.post("/purchases", response_model=PurchaseOut, status_code=201)
def create_purchase(
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="La factura debe tener al menos una línea")

    category = db.query(ExpenseCategory).filter(ExpenseCategory.id == payload.category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Categoría no encontrada")

    if payload.supplier_id is not None:
        supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Proveedor no encontrado")

    # Categorías de línea: las que difieran de la cabecera se validan en un solo query.
    line_category_ids = {it.category_id for it in payload.items if it.category_id and it.category_id != payload.category_id}
    if line_category_ids:
        found = {
            c.id for c in db.query(ExpenseCategory.id)
            .filter(ExpenseCategory.id.in_(line_category_ids)).all()
        }
        missing = line_category_ids - found
        if missing:
            raise HTTPException(status_code=404, detail=f"Categoría de línea no encontrada: {sorted(missing)}")

    # Si el documento es factura y los precios ya vienen con IVA, derivamos el neto
    # hacia atrás (÷1.19) en vez de sumarle IVA encima. divisor=1 → comportamiento normal.
    gross_input = payload.document_type == 'factura' and payload.prices_include_tax
    divisor = (1 + IVA_RATE) if gross_input else 1.0

    raw_sum = 0.0  # suma de lo ingresado tal cual (bruto si gross_input, neto si no)
    for it in payload.items:
        if it.product_id and it.ingredient_id:
            raise HTTPException(status_code=400, detail="Una línea no puede ser producto e insumo a la vez")
        if it.quantity <= 0 or it.unit_cost < 0:
            raise HTTPException(status_code=400, detail="Cantidad o costo inválido en una línea")
        raw_sum += it.quantity * it.unit_cost

    if gross_input:
        total = raw_sum                 # lo que realmente se pagó
        net = raw_sum / divisor
        tax = total - net
    else:
        net = raw_sum
        tax = net * IVA_RATE if payload.document_type == 'factura' else 0.0
        total = net + tax

    expense = Expense(
        category_id=payload.category_id,
        amount=round(total),
        description=payload.description,
        receipt_photo=payload.receipt_photo,
        document_type=payload.document_type,
        payment_method=payload.payment_method,
        seller_id=admin.id,
        supplier_id=payload.supplier_id,
    )
    db.add(expense)
    db.flush()  # obtener expense.id para las líneas

    for it in payload.items:
        # unit_cost y line_total se guardan SIEMPRE en neto (el divisor descuenta el
        # IVA cuando los precios vinieron con IVA; si no, divisor=1 y queda igual).
        net_unit_cost = it.unit_cost / divisor
        line_total = it.quantity * net_unit_cost
        db.add(PurchaseItem(
            expense_id=expense.id,
            product_id=it.product_id,
            ingredient_id=it.ingredient_id,
            # Solo persistimos categoría si difiere de la cabecera; null = hereda la de la factura.
            category_id=it.category_id if (it.category_id and it.category_id != payload.category_id) else None,
            description=it.description,
            quantity=it.quantity,
            unit_cost=net_unit_cost,
            line_total=line_total,
        ))

        if it.product_id:
            product = db.query(Product).filter(Product.id == it.product_id).first()
            if not product:
                raise HTTPException(status_code=404, detail=f"Producto {it.product_id} no encontrado")
            product.stock = (product.stock or 0) + it.quantity
            product.cost_price = net_unit_cost  # último costo neto de compra

        elif it.ingredient_id:
            ingredient = db.query(Ingredient).filter(Ingredient.id == it.ingredient_id).first()
            if not ingredient:
                raise HTTPException(status_code=404, detail=f"Insumo {it.ingredient_id} no encontrado")
            ingredient.current_stock += it.quantity
            ingredient.last_price = net_unit_cost
            db.add(IngredientMovement(
                ingredient_id=it.ingredient_id,
                type='purchase',
                quantity=it.quantity,
                cost=line_total,
                seller_id=admin.id,
                notes=f"Compra (factura #{expense.id})",
            ))

    db.commit()
    db.refresh(expense)
    log_action(db, ACTIONS.PURCHASE_CREATED, admin.id,
               f"Compra ${total:.0f} ({payload.document_type}) — {len(payload.items)} líneas en {category.name}")
    return _purchase_to_out(expense)


@router.get("/purchases", response_model=list[PurchaseOut])
def list_purchases(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    supplier_id: Optional[int] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = (
        db.query(Expense)
        .join(PurchaseItem, PurchaseItem.expense_id == Expense.id)
        .options(
            joinedload(Expense.category), joinedload(Expense.seller),
            joinedload(Expense.supplier),
            joinedload(Expense.purchase_items).joinedload(PurchaseItem.category),
        )
    )
    if date_from:
        q = q.filter(Expense.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(Expense.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))
    if supplier_id:
        q = q.filter(Expense.supplier_id == supplier_id)
    expenses = (
        q.distinct()
        .order_by(Expense.created_at.desc())
        .offset(offset).limit(limit).all()
    )
    return [_purchase_to_out(e) for e in expenses]


@router.get("/purchases/cost-history", response_model=list[CostHistoryEntry])
def cost_history(
    product_id: Optional[int] = Query(None),
    ingredient_id: Optional[int] = Query(None),
    limit: int = 30,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    if not product_id and not ingredient_id:
        raise HTTPException(status_code=400, detail="Indica product_id o ingredient_id")

    q = (
        db.query(PurchaseItem)
        .join(Expense, PurchaseItem.expense_id == Expense.id)
        .options(joinedload(PurchaseItem.expense).joinedload(Expense.supplier))
    )
    if product_id:
        q = q.filter(PurchaseItem.product_id == product_id)
    else:
        q = q.filter(PurchaseItem.ingredient_id == ingredient_id)

    items = q.order_by(Expense.created_at.desc()).limit(limit).all()
    return [
        CostHistoryEntry(
            expense_id=it.expense_id,
            date=it.expense.created_at,
            supplier_name=it.expense.supplier.name if it.expense and it.expense.supplier else None,
            document_type=it.expense.document_type if it.expense else 'factura',
            quantity=it.quantity,
            unit_cost=it.unit_cost,
        )
        for it in items
    ]
