from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Seller
from ..auth import hash_pin, require_admin
from ..audit import ACTIONS, log_action
from ..schemas import SellerCreate, SellerOut, SellerUpdate

router = APIRouter(prefix="/sellers", tags=["sellers"])


@router.get("/", response_model=list[SellerOut])
def list_sellers(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(Seller).all()


@router.post("/", response_model=SellerOut, status_code=201)
def create_seller(payload: SellerCreate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    seller = Seller(
        name=payload.name,
        pin=hash_pin(payload.pin),
        role=payload.role,
    )
    db.add(seller)
    db.commit()
    db.refresh(seller)
    log_action(db, ACTIONS.SELLER_CREATE, admin.id, f"Vendedor creado: {seller.name}")
    return seller


@router.patch("/{seller_id}", response_model=SellerOut)
def update_seller(
    seller_id: int,
    payload: SellerUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")

    if payload.name is not None:
        seller.name = payload.name
    if payload.pin is not None:
        seller.pin = hash_pin(payload.pin)
    if payload.role is not None:
        seller.role = payload.role
    if payload.active is not None:
        seller.active = payload.active

    db.commit()
    db.refresh(seller)
    log_action(db, ACTIONS.SELLER_UPDATE, admin.id, f"Vendedor actualizado: {seller.name}")
    return seller
