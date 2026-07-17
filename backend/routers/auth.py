from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Seller
from ..auth import (
    verify_pin, create_token, get_current_seller,
    get_lockout_status, record_failed_attempt, clear_attempts,
)
from ..audit import ACTIONS, log_action
from ..schemas import LoginRequest, DevLoginRequest, TokenOut, SellerOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/sellers", response_model=list[SellerOut])
def public_sellers(db: Session = Depends(get_db)):
    """Endpoint público: devuelve vendedores activos para la pantalla de login.

    Excluye la cuenta dev (proveedor): no debe aparecer en la pantalla del cliente.
    """
    return db.query(Seller).filter(
        Seller.active == True, Seller.role != "dev"
    ).all()


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


@router.post("/dev-login", response_model=TokenOut)
def dev_login(payload: DevLoginRequest, db: Session = Depends(get_db)):
    """Login oculto de la cuenta dev (proveedor). Recibe solo el PIN; la cuenta
    no aparece en la pantalla de selección. Se accede vía un gesto en el logo."""
    devs = db.query(Seller).filter(
        Seller.role == "dev", Seller.active == True
    ).all()
    locked_remaining = 0
    candidates = []
    for seller in devs:
        is_locked, remaining = get_lockout_status(seller)
        if is_locked:
            locked_remaining = max(locked_remaining, remaining)
            continue
        candidates.append(seller)
        if verify_pin(payload.pin, seller.pin):
            clear_attempts(seller, db)
            log_action(db, ACTIONS.LOGIN, seller.id, f"Login dev de {seller.name}")
            return TokenOut(
                access_token=create_token(seller.id),
                seller=SellerOut.model_validate(seller),
            )

    # PIN incorrecto: registrar el intento fallido en cada cuenta dev consultada,
    # con el mismo lockout que el login normal (3 intentos → 5 min).
    for seller in candidates:
        locked, remaining = record_failed_attempt(seller, db)
        if locked:
            locked_remaining = max(locked_remaining, remaining)

    if locked_remaining:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "Cuenta bloqueada temporalmente", "remaining_seconds": locked_remaining},
        )
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="PIN incorrecto")


@router.post("/logout")
def logout(seller: Seller = Depends(get_current_seller), db: Session = Depends(get_db)):
    log_action(db, ACTIONS.LOGOUT, seller.id, f"Logout de {seller.name}")
    return {"ok": True}


@router.get("/me", response_model=SellerOut)
def me(seller: Seller = Depends(get_current_seller)):
    return seller
