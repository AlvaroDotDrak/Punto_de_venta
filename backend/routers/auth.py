from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Seller
from ..auth import (
    verify_pin, create_token, get_current_seller,
    get_lockout_status, record_failed_attempt, clear_attempts,
)
from ..audit import ACTIONS, log_action
from ..schemas import LoginRequest, TokenOut, SellerOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/sellers", response_model=list[SellerOut])
def public_sellers(db: Session = Depends(get_db)):
    """Endpoint público: devuelve vendedores activos para la pantalla de login."""
    return db.query(Seller).filter(Seller.active == True).all()


@router.post("/login", response_model=TokenOut)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    seller = db.query(Seller).filter(
        Seller.id == payload.seller_id,
        Seller.active == True
    ).first()

    # Vendedor no existe → respuesta genérica para no revelar IDs válidos
    if not seller:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN incorrecto")

    # Verificar bloqueo (leído desde DB — sobrevive reinicios)
    is_locked, remaining = get_lockout_status(seller)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "Cuenta bloqueada temporalmente", "remaining_seconds": remaining},
        )

    if not verify_pin(payload.pin, seller.pin):
        locked, remaining = record_failed_attempt(seller, db)
        if locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"message": "Cuenta bloqueada temporalmente", "remaining_seconds": remaining},
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN incorrecto")

    clear_attempts(seller, db)
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
