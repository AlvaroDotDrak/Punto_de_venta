from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import ShowcaseItem, Product
from ..auth import get_current_seller, require_admin
from ..audit import ACTIONS, log_action
from ..schemas import ShowcaseItemCreate, ShowcaseItemOut

router = APIRouter(prefix="/showcase", tags=["showcase"])


@router.get("", response_model=list[ShowcaseItemOut])
def list_showcase(
    status: str = "active",
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    q = db.query(ShowcaseItem).options(joinedload(ShowcaseItem.product))
    if status != "all":
        q = q.filter(ShowcaseItem.status == status)
    return q.order_by(ShowcaseItem.placed_at.desc()).all()


@router.post("", response_model=ShowcaseItemOut, status_code=201)
def add_to_showcase(
    payload: ShowcaseItemCreate,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    item = ShowcaseItem(
        product_id=payload.product_id,
        showcase_type=payload.showcase_type,
        status="active",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    log_action(db, ACTIONS.SHOWCASE_ADD, seller.id,
               f"Producto {payload.product_id} agregado a vitrina ({payload.showcase_type})")

    return db.query(ShowcaseItem).options(
        joinedload(ShowcaseItem.product)
    ).filter(ShowcaseItem.id == item.id).first()


@router.post("/{item_id}/remove", response_model=ShowcaseItemOut)
def remove_from_showcase(
    item_id: int,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    item = db.query(ShowcaseItem).filter(ShowcaseItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    if item.status != "active":
        raise HTTPException(status_code=400, detail="El item no está activo")

    item.status = "removed"
    item.removed_at = datetime.now()
    db.commit()
    log_action(db, ACTIONS.SHOWCASE_REMOVE, seller.id, f"Item #{item_id} retirado de vitrina")
    return item


@router.post("/{item_id}/slice", response_model=list[ShowcaseItemOut])
def slice_showcase_item(
    item_id: int,
    slices: int = None,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    """Convierte un entero activo en trozos. Si no se indica slices, usa el valor del producto."""
    item = db.query(ShowcaseItem).filter(ShowcaseItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    if item.status != "active":
        raise HTTPException(status_code=400, detail="El item no está activo")
    if item.showcase_type != "entero":
        raise HTTPException(status_code=400, detail="Solo se pueden trozar enteros")

    product = db.query(Product).filter(Product.id == item.product_id).first()
    if slices is not None:
        if slices < 1 or slices > 30:
            raise HTTPException(status_code=422, detail="La cantidad de trozos debe estar entre 1 y 30")
        slices_count = slices
    else:
        slices_count = product.slices if product and product.slices else 8

    item.status = "sliced"
    item.sliced_at = datetime.now()

    new_items = []
    for _ in range(slices_count):
        trozo = ShowcaseItem(
            product_id=item.product_id,
            showcase_type="trozado",
            status="active",
            parent_id=item.id,
        )
        db.add(trozo)
        new_items.append(trozo)

    db.commit()
    for t in new_items:
        db.refresh(t)

    log_action(db, ACTIONS.SHOWCASE_SLICE, seller.id,
               f"Entero #{item_id} trozado en {slices_count} trozos (producto {item.product_id})")

    return db.query(ShowcaseItem).options(
        joinedload(ShowcaseItem.product)
    ).filter(ShowcaseItem.parent_id == item_id).all()


@router.post("/{item_id}/extend", response_model=ShowcaseItemOut)
def extend_showcase_time(
    item_id: int,
    extra_hours: int,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    """Extiende el tiempo de exposición moviendo placed_at hacia adelante."""
    item = db.query(ShowcaseItem).filter(ShowcaseItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")

    from datetime import timedelta
    item.placed_at = item.placed_at + timedelta(hours=extra_hours)
    db.commit()
    log_action(db, ACTIONS.SHOWCASE_EXTEND, admin.id,
               f"Item #{item_id} extendido {extra_hours}h")
    return item
