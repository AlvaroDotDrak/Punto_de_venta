from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from ..database import get_db
from ..models import Product, Sale, SaleItem, ProductRecipe, Ingredient
from ..auth import get_current_seller, require_admin, require_product_access
from ..audit import ACTIONS, log_action
from ..schemas import ProductCreate, ProductOut, ProductUpdate, RestockRequest
from ..utils import calculate_recipe_fraction, compute_cost_per_unit

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(
    active_only: bool = True,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    q = db.query(Product).options(joinedload(Product.recipes).joinedload(ProductRecipe.ingredient))
    if active_only:
        q = q.filter(Product.active == True)
    
    products = q.order_by(Product.name).all()
    
    units_sold_map = dict(
        db.query(SaleItem.product_id, func.sum(SaleItem.quantity))
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(Sale.status == "completed")
        .group_by(SaleItem.product_id)
        .all()
    )
    
    can_see_costs = seller.role == "admin" or seller.can_view_costs
    
    result = []
    for p in products:
        p_dict = {**p.__dict__}
        p_dict["has_recipe"] = len(p.recipes) > 0
        
        cost_per_unit = compute_cost_per_unit(p)
            
        p_dict["cost_per_unit"] = cost_per_unit if can_see_costs else None
        if not can_see_costs:
            p_dict["cost_price"] = None
        p_dict["units_sold"] = units_sold_map.get(p.id, 0)
        result.append(p_dict)
        
    return result


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    seller=Depends(require_product_access(write=True)),
):
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    log_action(db, ACTIONS.PRODUCT_CREATE, seller.id, f"Producto creado: {product.name}")
    return product


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    seller=Depends(require_product_access(write=True)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    log_action(db, ACTIONS.PRODUCT_UPDATE, seller.id, f"Producto actualizado: {product.name}")
    return product


@router.post("/{product_id}/restock", response_model=ProductOut)
def restock_product(
    product_id: int,
    payload: RestockRequest,
    db: Session = Depends(get_db),
    seller=Depends(require_product_access(write=True)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if product.stock is None:
        raise HTTPException(status_code=400, detail="Este producto no tiene tracking de stock")
    product.stock += payload.quantity
    db.commit()
    db.refresh(product)
    log_action(db, ACTIONS.PRODUCT_UPDATE, seller.id, f"Restock {product.name}: +{payload.quantity} (total: {product.stock})")
    return product


@router.get("/{product_id}/stats")
def get_product_stats(
    product_id: int,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=Depends(require_product_access(write=False)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    q = (
        db.query(SaleItem)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .options(joinedload(SaleItem.sale))
        .filter(SaleItem.product_id == product_id)
        .filter(Sale.status == "completed")
    )

    dt_from = datetime.fromisoformat(date_from) if date_from else None
    dt_to = datetime.fromisoformat(date_to) + timedelta(days=1) if date_to else None

    if dt_from:
        q = q.filter(Sale.created_at >= dt_from)
    if dt_to:
        q = q.filter(Sale.created_at < dt_to)

    items = q.all()

    if not items:
        return {
            "total_units": 0, "total_revenue": 0, "sales_count": 0,
            "avg_units_per_day": 0, "daily_trend": [],
            "by_showcase_type": None, "best_day_of_week": None, "last_sale_at": None,
        }

    total_units = sum(i.quantity for i in items)
    total_revenue = sum(i.subtotal for i in items)
    sales_count = len({i.sale_id for i in items})

    daily: dict = defaultdict(lambda: {"units": 0, "revenue": 0.0})
    day_of_week: dict = defaultdict(int)

    for item in items:
        sale_dt = item.sale.created_at
        daily[sale_dt.strftime("%Y-%m-%d")]["units"] += item.quantity
        daily[sale_dt.strftime("%Y-%m-%d")]["revenue"] += item.subtotal
        day_of_week[sale_dt.weekday()] += item.quantity

    daily_trend = [
        {"date": k, "units": v["units"], "revenue": round(v["revenue"])}
        for k, v in sorted(daily.items())
    ]

    if dt_from and dt_to:
        days_span = max((dt_to - dt_from).days, 1)
    else:
        sorted_dates = sorted(daily.keys())
        first = datetime.fromisoformat(sorted_dates[0])
        last = datetime.fromisoformat(sorted_dates[-1])
        days_span = max((last - first).days + 1, 1)

    avg_units_per_day = round(total_units / days_span, 1)

    day_names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
    best_dow = max(day_of_week, key=day_of_week.__getitem__)
    best_day_of_week = {"day": day_names[best_dow], "units": day_of_week[best_dow]}

    by_showcase_type = None
    if any(i.showcase_type for i in items):
        by_showcase_type = {
            "entero": sum(i.quantity for i in items if i.showcase_type == "entero"),
            "trozado": sum(i.quantity for i in items if i.showcase_type == "trozado"),
        }

    last_sale_at = max(i.sale.created_at for i in items).isoformat()

    return {
        "total_units": total_units,
        "total_revenue": round(total_revenue),
        "sales_count": sales_count,
        "avg_units_per_day": avg_units_per_day,
        "daily_trend": daily_trend,
        "by_showcase_type": by_showcase_type,
        "best_day_of_week": best_day_of_week,
        "last_sale_at": last_sale_at,
    }


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    seller=Depends(require_product_access(write=True)),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product.active = False   # soft delete
    db.commit()
    log_action(db, ACTIONS.PRODUCT_DELETE, seller.id, f"Producto desactivado: {product.name}")
