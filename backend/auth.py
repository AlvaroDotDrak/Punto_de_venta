import hashlib
from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from .database import get_db
from .models import Seller

# Mismo salt que la versión JS para compatibilidad con PINs existentes
SALT = "_pasteleria_salt_2026"
SECRET_KEY = "pasteleria_jwt_secret_2026"
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 12

security = HTTPBearer()


def hash_pin(pin: str) -> str:
    """SHA-256 con el mismo salt que crypto.js para compatibilidad."""
    return hashlib.sha256(f"{pin}{SALT}".encode()).hexdigest()


def verify_pin(pin: str, hashed: str) -> bool:
    return hash_pin(pin) == hashed


def create_token(seller_id: int) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
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
