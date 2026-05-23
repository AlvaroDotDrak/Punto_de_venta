import hashlib
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import get_db
from .models import Seller

SALT = os.environ.get("PIN_SALT")
SECRET_KEY = os.environ.get("JWT_SECRET_KEY")

if not SALT or not SECRET_KEY:
    raise RuntimeError(
        "Variables de entorno PIN_SALT y JWT_SECRET_KEY son requeridas. "
        "Copia .env.example a .env y configura los valores."
    )
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 12

security = HTTPBearer()

MAX_ATTEMPTS = 3
LOCKOUT_SECONDS = 300  # 5 minutos


# ── Lockout de PIN (persistido en DB) ────────────────────────────────────────

def get_lockout_status(seller: Seller) -> tuple[bool, int]:
    """Retorna (está_bloqueado, segundos_restantes). Lee de la DB."""
    if not seller.locked_until:
        return False, 0
    remaining = int((seller.locked_until - datetime.now()).total_seconds())
    if remaining <= 0:
        return False, 0
    return True, remaining


def record_failed_attempt(seller: Seller, db: Session) -> tuple[bool, int]:
    """Registra un intento fallido en DB. Retorna (bloqueado_ahora, segundos_restantes)."""
    # Si el bloqueo anterior ya expiró, resetear
    if seller.locked_until and datetime.now() >= seller.locked_until:
        seller.failed_attempts = 0
        seller.locked_until = None

    seller.failed_attempts = (seller.failed_attempts or 0) + 1

    if seller.failed_attempts >= MAX_ATTEMPTS and not seller.locked_until:
        seller.locked_until = datetime.now() + timedelta(seconds=LOCKOUT_SECONDS)

    db.commit()

    if seller.locked_until:
        remaining = int((seller.locked_until - datetime.now()).total_seconds())
        return True, max(0, remaining)
    return False, 0


def clear_attempts(seller: Seller, db: Session) -> None:
    """Limpia el contador tras un login exitoso."""
    seller.failed_attempts = 0
    seller.locked_until = None
    db.commit()


# ── Hashing y JWT ─────────────────────────────────────────────────────────────

def hash_pin(pin: str) -> str:
    return hashlib.sha256(f"{pin}{SALT}".encode()).hexdigest()


def verify_pin(pin: str, hashed: str) -> bool:
    return hash_pin(pin) == hashed


def create_token(seller_id: int) -> str:
    expire = datetime.now() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": str(seller_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_seller(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Seller:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        seller_id: Optional[str] = payload.get("sub")
        if seller_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    seller = db.query(Seller).filter(Seller.id == int(seller_id), Seller.active == True).first()
    if not seller:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Vendedor no encontrado")
    return seller


def require_admin(seller: Seller = Depends(get_current_seller)) -> Seller:
    if seller.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Se requiere rol admin")
    return seller


def require_product_access(write: bool = False):
    """Permite acceso a admin, o a sellers según su products_access."""
    def _check(seller: Seller = Depends(get_current_seller)):
        if seller.role == "admin":
            return seller
        if write and seller.products_access == "full":
            return seller
        if not write and seller.products_access in ("view", "full"):
            return seller
        raise HTTPException(status_code=403, detail="Sin permisos para Productos")
    return _check


def require_permission(perm: str):
    """Permite acceso a admin, o a sellers con el permiso booleano indicado."""
    def _check(seller: Seller = Depends(get_current_seller)):
        if seller.role == "admin":
            return seller
        if getattr(seller, perm, False):
            return seller
        raise HTTPException(status_code=403, detail="Sin permisos suficientes")
    return _check
