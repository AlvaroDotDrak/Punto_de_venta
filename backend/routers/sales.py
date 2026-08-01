import math
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import CashMovement, CashRegister, Sale, SaleItem, ShowcaseItem, Product, ProductRecipe, IngredientMovement
from ..auth import get_current_seller, require_admin, require_permission
from ..audit import ACTIONS, log_action
from ._common import parse_date_from, parse_date_to
from .config import _build_discount, _get_weight_mode
from ..schemas import SaleCreate, SaleOut, VoidSaleRequest
from ..utils import calculate_recipe_fraction

router = APIRouter(prefix="/sales", tags=["sales"])


def _round_half_up(x: float) -> int:
    """Redondeo hacia arriba en .5, igual que Math.round del frontend (CLP sin decimales)."""
    return int(math.floor(x + 0.5))


def _authoritative_unit_price(product: Product, item_in, weight_mode: str = "kg") -> float:
    """Precio unitario recalculado desde el producto en la DB, replicando la
    lógica de precios de Ventas.jsx. Nunca se confía en el precio del cliente:
    así una venta manipulada no puede fijar montos arbitrarios.

    Única excepción: venta por peso en modo 'amount'. Ahí la balanza del local ya
    calculó el precio y la cajera tipea ese monto — el servidor no tiene con qué
    recalcularlo porque no conoce los gramos. No agrega riesgo respecto del modo
    'kg': tipear 0,5 kg en vez de 1,5 kg es exactamente el mismo fraude que
    tipear $5.000 en vez de $15.000, y ambos quedan en el audit log."""
    if item_in.showcase_type == "trozado":
        if product.slice_price is not None:
            return product.slice_price
        return _round_half_up(product.price / (product.slices or 8))
    if item_in.showcase_type == "entero":
        return product.price
    if product.sold_by == "weight":
        if weight_mode == "amount" and item_in.amount is not None:
            return _round_half_up(item_in.amount)
        if item_in.weight is not None:
            return _round_half_up((item_in.weight or 0) * product.price)
    return product.price


def _kg_consumidos(product: Product, item_in, weight_mode: str) -> float:
    """Kilos que salen del stock. En modo 'amount' se deducen del monto y del
    precio por kilo: es aproximado, pero mantiene el inventario vivo en vez de
    dejarlo congelado."""
    if weight_mode == "amount" and item_in.amount is not None:
        return (item_in.amount / product.price) if product.price else 0.0
    return item_in.weight or 0.0


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
    # La caja debe estar abierta: sin esto, las ventas en efectivo quedarían
    # fuera del arqueo y el cierre del día no cuadraría.
    register = db.query(CashRegister).filter(CashRegister.status == "open").first()
    if not register:
        raise HTTPException(status_code=400, detail="La caja debe estar abierta para registrar ventas")

    has_receipt = True if payload.payment_method == "tarjeta" else bool(payload.has_receipt)
    weight_mode = _get_weight_mode(db)

    sale = Sale(
        total=0,  # se fija con el total recalculado en el servidor tras el loop
        payment_method=payload.payment_method,
        seller_id=seller.id,
        order_id=payload.order_id,
        status="completed",
        has_receipt=has_receipt,
    )
    db.add(sale)
    db.flush()  # obtener sale.id antes de commit

    # Agregar items
    server_total = 0.0
    for item_in in payload.items:
        # Obtener información del producto
        product = None
        if item_in.product_id:
            product = db.query(Product).filter(Product.id == item_in.product_id).first()

        # Precio/subtotal autoritativos desde la DB. Sin producto (ítem manual sin
        # product_id) se conserva lo enviado por el cliente: no hay de dónde recalcular.
        if product:
            unit_price = _authoritative_unit_price(product, item_in, weight_mode)
            subtotal = unit_price * item_in.quantity
        else:
            unit_price = item_in.price
            subtotal = item_in.subtotal
        server_total += subtotal

        item = SaleItem(
            sale_id=sale.id,
            product_id=item_in.product_id,
            product_name=item_in.product_name,
            price=unit_price,
            quantity=item_in.quantity,
            subtotal=subtotal,
            showcase_type=item_in.showcase_type,
            weight=item_in.weight,
        )
        db.add(item)

        # Actualizar stock vitrina si aplica
        if item_in.showcase_type and item_in.product_id:
            for _ in range(item_in.quantity):
                _handle_showcase_stock(db, item_in.product_id, item_in.showcase_type, sale.id)
                db.flush()  # necesario: autoflush=False, sin esto el query del siguiente ciclo ve estado stale

        # Decrementar stock físico (bebidas, congelados). Por peso descuenta kg.
        if product and not item_in.showcase_type:
            if product.stock is not None:
                if product.sold_by == "weight":
                    consumed = _kg_consumidos(product, item_in, weight_mode) * item_in.quantity
                    unit_label = "kg"
                else:
                    consumed = item_in.quantity
                    unit_label = "u"
                if product.stock < consumed:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Stock insuficiente para '{product.name}' (disponible: {product.stock:g} {unit_label})"
                    )
                product.stock -= consumed

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

    # Descuento: el cliente solo pide aplicarlo. El porcentaje sale de la config
    # del negocio y se valida acá — si viniera del cliente, cualquiera con la
    # consola abierta se haría un 90%.
    discount_percent = 0.0
    discount_amount = 0.0
    if payload.apply_discount:
        if not (seller.role in ("admin", "dev") or seller.can_apply_discount):
            raise HTTPException(status_code=403, detail="Sin permisos para aplicar descuentos")
        discount = _build_discount(db)
        if not discount["active"]:
            detalle = ("El descuento venció el " + discount["valid_until"]
                       if discount["expired"] else "No hay un descuento activo")
            raise HTTPException(status_code=400, detail=detalle)
        discount_percent = discount["percent"]
        discount_amount = _round_half_up(server_total * discount_percent / 100)

    sale.subtotal = server_total
    sale.discount_percent = discount_percent
    sale.discount_amount = discount_amount
    server_total = server_total - discount_amount
    sale.total = server_total

    # Toda venta deja movimiento de caja, sea cual sea el método: la caja es el
    # registro completo del turno. Solo el efectivo afecta el cajón físico, y de
    # eso ya se encarga _expected_cash filtrando por payment_method.
    db.add(CashMovement(
        register_id=register.id,
        type="sale",
        amount=server_total,
        payment_method=payload.payment_method,
        sale_id=sale.id,
        seller_id=seller.id,
    ))

    db.commit()
    db.refresh(sale)
    detalle_desc = (f" · {discount_percent:g}% dcto (-${discount_amount:.0f})" if discount_amount else "")
    log_action(db, ACTIONS.SALE, seller.id,
               f"Venta ${server_total:.0f} - {payload.payment_method}{detalle_desc}")

    return db.query(Sale).options(
        joinedload(Sale.items), joinedload(Sale.seller)
    ).filter(Sale.id == sale.id).first()


@router.get("", response_model=list[SaleOut])
def list_sales(
    limit: int = Query(50, ge=1, le=2000),
    offset: int = 0,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    db: Session = Depends(get_db),
    _=Depends(require_permission('can_access_historial')),
):
    q = db.query(Sale).options(joinedload(Sale.items), joinedload(Sale.seller))
    dt_from = parse_date_from(date_from)
    dt_to = parse_date_to(date_to)
    if dt_from:
        q = q.filter(Sale.created_at >= dt_from)
    if dt_to:
        q = q.filter(Sale.created_at <= dt_to)
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
    seller=Depends(require_permission("can_void_sales")),
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

    # Movimiento de caja negativo, con el método original de la venta (solo el
    # efectivo descuenta del cajón; el resto es para que el resumen del turno
    # descuente la venta anulada de su método).
    register = db.query(CashRegister).filter(CashRegister.status == "open").first()
    if register:
        db.add(CashMovement(
            register_id=register.id,
            type="void",
            amount=-sale.total,
            payment_method=sale.payment_method,
            sale_id=sale.id,
            description=f"Anulación venta #{sale.id}",
            seller_id=seller.id,
        ))

    db.commit()
    log_action(db, ACTIONS.VOID_SALE, seller.id, f"Venta #{sale_id} anulada: {payload.reason}")

    return db.query(Sale).options(
        joinedload(Sale.items), joinedload(Sale.seller)
    ).filter(Sale.id == sale_id).first()
