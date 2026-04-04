"""
Registro de auditoría. Equivalente a src/utils/auditLog.js
Falla silenciosamente para no interrumpir el flujo principal.
"""
from sqlalchemy.orm import Session
from .models import AuditLog


class ACTIONS:
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    SALE = "SALE"
    VOID_SALE = "VOID_SALE"
    CASH_OPEN = "CASH_OPEN"
    CASH_CLOSE = "CASH_CLOSE"
    CASH_MOVEMENT = "CASH_MOVEMENT"
    PRODUCT_CREATE = "PRODUCT_CREATE"
    PRODUCT_UPDATE = "PRODUCT_UPDATE"
    PRODUCT_DELETE = "PRODUCT_DELETE"
    SHOWCASE_ADD = "SHOWCASE_ADD"
    SHOWCASE_REMOVE = "SHOWCASE_REMOVE"
    SHOWCASE_EXTEND = "SHOWCASE_EXTEND"
    ORDER_CREATE = "ORDER_CREATE"
    ORDER_UPDATE = "ORDER_UPDATE"
    SELLER_CREATE = "SELLER_CREATE"
    SELLER_UPDATE = "SELLER_UPDATE"
    INGREDIENT_CREATE = "INGREDIENT_CREATE"
    INGREDIENT_MOVEMENT = "INGREDIENT_MOVEMENT"
    BACKUP = "BACKUP"
    IMPORT_DATA = "IMPORT_DATA"


def log_action(db: Session, action: str, seller_id: int | None, details: str = "") -> None:
    """Registra una acción en el audit log. No lanza excepciones."""
    try:
        entry = AuditLog(action=action, seller_id=seller_id, details=details)
        db.add(entry)
        db.commit()
    except Exception as e:
        print(f"[audit] warn: no se pudo registrar acción '{action}': {e}")
