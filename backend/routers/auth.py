from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Seller
from ..auth import verify_pin, create_token, get_current_seller
from ..audit import ACTIONS, log_action
from ..schemas import LoginRequest, TokenOut, SellerOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    seller = db.query(Seller).filter(
        Seller.id == payload.seller_id,
        Seller.active == True
    ).first()

    if not seller or not verify_pin(payload.pin, seller.pin):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN incorrecto")

    log_action(db, ACTIONS.LOGIN, seller.id, f"Login de {seller.name}")

    return TokenOut(
        access_token=create_token(seller.id),
        seller=SellerOut.model_validate(seller),
    )


@router.post("/logout")
def logout(seller: Seller = Depends(get_current_seller), db: Session = Depends(get_db)):
    log_action(db, ACTIONS.LOGOUT, seller.id, f"Logout de {seller.name}")
    return {"ok": True}


@router.get("/me", response_model=SellerOut)
def me(seller: Seller = Depends(get_current_seller)):
    return seller
