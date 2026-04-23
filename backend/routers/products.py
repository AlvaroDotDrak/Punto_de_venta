from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Product
from ..auth import get_current_seller, require_admin
from ..audit import ACTIONS, log_action
from ..schemas import ProductCreate, ProductOut, ProductUpdate, RestockRequest

router = APIRouter(prefix="/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(
    active_only: bool = True,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    q = db.query(Product)
    if active_only:
        q = q.filter(Product.active == True)
    return q.order_by(Product.name).all()


@router.post("", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    log_action(db, ACTIONS.PRODUCT_CREATE, admin.id, f"Producto creado: {product.name}")
    return product


@router.patch("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(product, field, value)

    db.commit()
    db.refresh(product)
    log_action(db, ACTIONS.PRODUCT_UPDATE, admin.id, f"Producto actualizado: {product.name}")
    return product


@router.post("/{product_id}/restock", response_model=ProductOut)
def restock_product(
    product_id: int,
    payload: RestockRequest,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if product.stock is None:
        raise HTTPException(status_code=400, detail="Este producto no tiene tracking de stock")
    product.stock += payload.quantity
    db.commit()
    db.refresh(product)
    log_action(db, ACTIONS.PRODUCT_UPDATE, admin.id, f"Restock {product.name}: +{payload.quantity} (total: {product.stock})")
    return product


@router.delete("/{product_id}", status_code=204)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product.active = False   # soft delete
    db.commit()
    log_action(db, ACTIONS.PRODUCT_DELETE, admin.id, f"Producto desactivado: {product.name}")
