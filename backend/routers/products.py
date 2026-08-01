import base64
import json
import urllib.error
import urllib.parse
import urllib.request
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
from ..schemas import RestockBulkRequest, RestockBulkResult, ProductCreate, ProductOut, ProductUpdate, RestockRequest
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


@router.post("/restock-bulk", response_model=RestockBulkResult)
def restock_bulk(
    payload: RestockBulkRequest,
    db: Session = Depends(get_db),
    seller=Depends(require_product_access(write=True)),
):
    """Repone varios productos de una sola vez (el lote de la mañana).

    Producto por producto eran N requests y N confirmaciones para algo que se
    hace todos los días. Se aplica todo o nada: si una línea es inválida, no se
    guarda ninguna, para no dejar el inventario a medio cargar."""
    if not payload.items:
        raise HTTPException(status_code=400, detail="No hay líneas para reponer")

    ids = [it.product_id for it in payload.items]
    productos = {p.id: p for p in db.query(Product).filter(Product.id.in_(ids)).all()}

    avisos = []
    for it in payload.items:
        producto = productos.get(it.product_id)
        if producto is None:
            raise HTTPException(status_code=404, detail=f"Producto {it.product_id} no encontrado")
        if producto.stock is None:
            # Igual que en compras: stock=None significa "no lleva inventario" y
            # asignarle un número lo volvería bloqueable en el POS al llegar a 0.
            avisos.append(f"{producto.name}: no lleva inventario, se omitió")
            continue
        producto.stock += it.quantity

    aplicados = [it for it in payload.items if productos[it.product_id].stock is not None]
    db.commit()

    detalle = ", ".join(f"{productos[it.product_id].name} +{it.quantity:g}" for it in aplicados)
    log_action(db, ACTIONS.PRODUCT_UPDATE, seller.id, f"Reposición por lote: {detalle}"[:500])
    return RestockBulkResult(actualizados=len(aplicados), avisos=avisos)


# Open Food Facts: base abierta de productos empaquetados. Sin API key; solo
# pide un User-Agent identificable. Un timeout corto para que un internet lento
# no congele el loop de carga rápida.
OFF_URL = ("https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
           "?fields=product_name,product_name_es,brands,quantity,image_front_small_url")
OFF_USER_AGENT = "PuntoDeVentaPOS/2.0"
OFF_TIMEOUT = 4


def _off_display_name(data: dict) -> str:
    """Arma 'Marca Nombre Gramaje' sin duplicar lo que el nombre ya incluye."""
    name = (data.get("product_name_es") or data.get("product_name") or "").strip()
    if not name:
        return ""
    brand = (data.get("brands") or "").split(",")[0].strip()
    quantity = (data.get("quantity") or "").strip()
    parts = []
    if brand and brand.lower() not in name.lower():
        parts.append(brand)
    parts.append(name)
    if quantity and quantity.lower() not in name.lower():
        parts.append(quantity)
    return " ".join(parts)


def _off_fetch_photo(url: str) -> Optional[str]:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": OFF_USER_AGENT})
        with urllib.request.urlopen(req, timeout=OFF_TIMEOUT) as resp:
            raw = resp.read()
        if not raw or len(raw) > 500_000:
            return None
        return "data:image/jpeg;base64," + base64.b64encode(raw).decode()
    except Exception:
        return None  # sin foto el lookup igual sirve


@router.get("/lookup/{barcode}")
def lookup_barcode(
    barcode: str,
    db: Session = Depends(get_db),
    _=Depends(require_product_access(write=True)),
):
    """Autocompletado para la carga rápida: primero la DB local (detecta
    duplicados), después Open Food Facts. Nunca lanza 500 por problemas de red —
    devuelve found=False con error='offline' y el frontend degrada a tipeo manual."""
    barcode = barcode.strip()
    if not barcode:
        raise HTTPException(status_code=422, detail="Código de barras vacío")

    existing = (
        db.query(Product)
        .filter(Product.barcode == barcode)
        .order_by(Product.active.desc())
        .first()
    )
    if existing:
        return {
            "found": True,
            "source": "local",
            "product_id": existing.id,
            "name": existing.name,
            "price": existing.price,
            "stock": existing.stock,
            "active": existing.active,
        }

    try:
        req = urllib.request.Request(
            OFF_URL.format(barcode=urllib.parse.quote(barcode)),
            headers={"User-Agent": OFF_USER_AGENT},
        )
        with urllib.request.urlopen(req, timeout=OFF_TIMEOUT) as resp:
            payload = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {"found": False, "source": "none"}
        return {"found": False, "source": "none", "error": "offline"}
    except Exception:
        return {"found": False, "source": "none", "error": "offline"}

    product_data = payload.get("product") or {}
    name = _off_display_name(product_data)
    if payload.get("status") != 1 or not name:
        return {"found": False, "source": "none"}

    image_url = product_data.get("image_front_small_url")
    photo = _off_fetch_photo(image_url) if image_url else None

    return {"found": True, "source": "openfoodfacts", "name": name, "photo": photo}


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
