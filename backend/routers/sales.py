from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister, Sale, SaleItem, ShowcaseItem, Product, ProductRecipe, IngredientMovement
from ..auth import get_current_seller, require_admin, require_permission
from ..audit import ACTIONS, log_action
from ..schemas import SaleCreate, SaleOut, VoidSaleRequest
from ..utils import calculate_recipe_fraction

router = APIRouter(prefix="/sales", tags=["sales"])


def _handle_showcase_stock(db: Session, product_id: int, showcase_type: str, sale_id: int):
    """
    Lógica de trozado: equivalente al flujo crítico de Ventas.jsx.
    Actualiza showcaseItems al vender un entero o trozo.
    Si no hay stock en vitrina, lo crea automáticamente ("Vitrina Automática").
    """
    if showcase_type == "entero":
        item = db.query(ShowcaseItem).filter(
            ShowcaseItem.product_id == product_id,
            ShowcaseItem.showcase_type == "entero",
            ShowcaseItem.status == "active",
        ).first()
        if item:
            item.status = "sold"
            item.sale_id = sale_id
        else:
            # Vitrina Automática: Crear y marcar como vendido de inmediato
            db.add(ShowcaseItem(
                product_id=product_id,
                showcase_type="entero",
                status="sold",
                sale_id=sale_id
            ))
        return

    # Vender trozo
    trozo = db.query(ShowcaseItem).filter(
        ShowcaseItem.product_id == product_id,
        ShowcaseItem.showcase_type == "trozado",
        ShowcaseItem.status == "active",
    ).first()

    if trozo:
        trozo.status = "sold"
        trozo.sale_id = sale_id
        return

    # No hay trozos → rebanar un entero
    entero = db.query(ShowcaseItem).filter(
        ShowcaseItem.product_id == product_id,
        ShowcaseItem.showcase_type == "entero",
        ShowcaseItem.status == "active",
    ).first()

    product = db.query(Product).filter(Product.id == product_id).first()
    slices_count = product.slices if (product and product.slices) else 8

    if not entero:
        # Vitrina Automática: Crear un entero y trocearlo de inmediato
        entero = ShowcaseItem(
            product_id=product_id,
            showcase_type="entero",
            status="sliced",
            sliced_at=datetime.now()
        )
        db.add(entero)
        db.flush()  # Obtener ID para enlazar los trozos
    else:
        entero.status = "sliced"
        entero.sliced_at = datetime.now()

    # Crear (slices - 1) trozos nuevos activos
    for _ in range(slices_count - 1):
        db.add(ShowcaseItem(
            product_id=product_id,
            showcase_type="trozado",
            status="active",
            parent_id=entero.id,
        ))

    # El trozo vendido
    db.add(ShowcaseItem(
        product_id=product_id,
        showcase_type="trozado",
        status="sold",
        parent_id=entero.id,
        sale_id=sale_id,
    ))


@router.post("", response_model=SaleOut, status_code=201)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    # Verificar caja abierta
    register = db.query(CashRegister).filter(CashRegister.status == "open").first()

    has_receipt = True if payload.payment_method == "tarjeta" else bool(payload.has_receipt)

    sale = Sale(
        total=payload.total,
        payment_method=payload.payment_method,
        seller_id=seller.id,
        order_id=payload.order_id,
        status="completed",
        has_receipt=has_receipt,
    )
    db.add(sale)
    db.flush()  # obtener sale.id antes de commit

    # Agregar items
    for item_in in payload.items:
        item = SaleItem(
            sale_id=sale.id,
            product_id=item_in.product_id,
            product_name=item_in.product_name,
            price=item_in.price,
            quantity=item_in.quantity,
            subtotal=item_in.subtotal,
            showcase_type=item_in.showcase_type,
        )
        db.add(item)

        # Obtener información del producto
        product = None
        if item_in.product_id:
            product = db.query(Product).filter(Product.id == item_in.product_id).first()

        # Actualizar stock vitrina si aplica
        if item_in.showcase_type and item_in.product_id:
            for _ in range(item_in.quantity):
                _handle_showcase_stock(db, item_in.product_id, item_in.showcase_type, sale.id)
                db.flush()  # necesario: autoflush=False, sin esto el query del siguiente ciclo ve estado stale

        # Decrementar stock físico (bebidas)
        if product and not item_in.showcase_type:
            if product.stock is not None:
                if product.stock < item_in.quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Stock insuficiente para '{product.name}' (disponible: {product.stock})"
                    )
                product.stock -= item_in.quantity

        # Descontar insumos basados en recetas de productos (si existen)
        if product:
            recipes = db.query(ProductRecipe).filter(ProductRecipe.product_id == item_in.product_id).all()
            if recipes:
                    # Calcular la fracción de la receta consumida
                    slices_count = product.slices if (product and product.slices) else 8
                    fraction = calculate_recipe_fraction(item_in.quantity, item_in.showcase_type, slices_count)

                    for r in recipes:
                        qty_used = (fraction * r.quantity) / r.yield_qty
                        # Registrar movimiento de consumo de ingredientes
                        movement = IngredientMovement(
                            ingredient_id=r.ingredient_id,
                            type="usage",
                            quantity=qty_used,
                            cost=qty_used * (r.ingredient.last_price or 0.0),
                            seller_id=seller.id,
                            sale_id=sale.id,
                            product_id=item_in.product_id
                        )
                        db.add(movement)
                        # Descontar stock (permite stock negativo)
                        r.ingredient.current_stock -= qty_used

    # Registrar movimiento de caja si hay caja abierta y es efectivo
    if register and payload.payment_method == "efectivo":
        db.add(CashMovement(
            register_id=register.id,
            type="sale",
            amount=payload.total,
            payment_method="efectivo",
            sale_id=sale.id,
        ))

    db.commit()
    db.refresh(sale)
    log_action(db, ACTIONS.SALE, seller.id, f"Venta ${payload.total:.0f} - {payload.payment_method}")

    return db.query(Sale).options(
        joinedload(Sale.items), joinedload(Sale.seller)
    ).filter(Sale.id == sale.id).first()


@router.get("", response_model=list[SaleOut])
def list_sales(
    limit: int = 50,
    offset: int = 0,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_permission('can_access_historial')),
):
    q = db.query(Sale).options(joinedload(Sale.items), joinedload(Sale.seller))
    if date_from:
        q = q.filter(Sale.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(Sale.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))
    return q.order_by(Sale.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/{sale_id}", response_model=SaleOut)
def get_sale(sale_id: int, db: Session = Depends(get_db), _=Depends(get_current_seller)):
    sale = (
        db.query(Sale)
        .options(joinedload(Sale.items), joinedload(Sale.seller))
        .filter(Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return sale


@router.post("/{sale_id}/void", response_model=SaleOut)
def void_sale(
    sale_id: int,
    payload: VoidSaleRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    if len(payload.reason) < 10:
        raise HTTPException(status_code=422, detail="La razón debe tener al menos 10 caracteres")

    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    if sale.status == "voided":
        raise HTTPException(status_code=400, detail="La venta ya fue anulada")

    # Anular venta
    sale.status = "voided"
    sale.voided_at = datetime.now()
    sale.void_reason = payload.reason

    # Revertir showcase items
    showcase_items = db.query(ShowcaseItem).filter(ShowcaseItem.sale_id == sale_id).all()
    for item in showcase_items:
        item.status = "active"
        item.sale_id = None

    # Revertir movimientos de insumos asociados a la venta
    ingredient_movements = db.query(IngredientMovement).filter(IngredientMovement.sale_id == sale_id).all()
    for mov in ingredient_movements:
        if mov.ingredient:
            # Al anular sumamos de vuelta lo consumido
            mov.ingredient.current_stock += mov.quantity
        db.delete(mov)

    # Movimiento de caja negativo si era efectivo
    register = db.query(CashRegister).filter(CashRegister.status == "open").first()
    if register and sale.payment_method == "efectivo":
        db.add(CashMovement(
            register_id=register.id,
            type="void",
            amount=-sale.total,
            payment_method="efectivo",
            sale_id=sale.id,
            description=f"Anulación venta #{sale.id}",
        ))

    db.commit()
    log_action(db, ACTIONS.VOID_SALE, admin.id, f"Venta #{sale_id} anulada: {payload.reason}")

    return db.query(Sale).options(
        joinedload(Sale.items), joinedload(Sale.seller)
    ).filter(Sale.id == sale_id).first()
