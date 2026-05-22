"""
Backup automático a archivo JSON local.
Equivalente a src/utils/autoBackup.js pero guarda en disco en vez de forzar descarga.
"""
import json
from datetime import datetime, date
from pathlib import Path
from sqlalchemy.orm import Session
from .models import (
    AuditLog, CashMovement, CashRegister, Ingredient,
    IngredientMovement, Order, OrderItem, Product,
    Sale, SaleItem, Seller, ShowcaseItem
)
from .audit import ACTIONS, log_action

BACKUP_DIR = Path.home() / "punto_de_venta_backups"
LAST_BACKUP_FILE = BACKUP_DIR / ".last_backup_date"
MAX_BACKUPS = 30

# Campos excluidos del backup (base64 pesado; ya vive en pasteleria.db)
_EXCLUDE_FIELDS = {
    "products": {"photo"},
    "sellers": {"photo"},
}


def _serialize(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    raise TypeError(f"No serializable: {type(obj)}")


def _table_to_list(db: Session, model, exclude: set = None) -> list[dict]:
    rows = db.query(model).all()
    result = []
    for row in rows:
        d = {c.name: getattr(row, c.name) for c in row.__table__.columns
             if not exclude or c.name not in exclude}
        result.append(d)
    return result


def _rotate_backups():
    """Elimina backups más allá de MAX_BACKUPS, ordenados por fecha."""
    files = sorted(BACKUP_DIR.glob("backup_*.json"))
    for old in files[:-MAX_BACKUPS]:
        old.unlink()


def check_and_run_backup(db: Session) -> bool:
    """
    Dispara un backup si pasaron 24h desde el último.
    Retorna True si se ejecutó el backup.
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    today = date.today().isoformat()
    if LAST_BACKUP_FILE.exists():
        last = LAST_BACKUP_FILE.read_text().strip()
        if last == today:
            return False

    _run_backup(db)
    LAST_BACKUP_FILE.write_text(today)
    return True


def _run_backup(db: Session) -> Path:
    """Exporta todas las tablas a un JSON con timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = BACKUP_DIR / f"backup_{timestamp}.json"

    data = {
        "exported_at": datetime.now().isoformat(),
        "sellers": _table_to_list(db, Seller, _EXCLUDE_FIELDS.get("sellers")),
        "products": _table_to_list(db, Product, _EXCLUDE_FIELDS.get("products")),
        "showcase_items": _table_to_list(db, ShowcaseItem),
        "sales": _table_to_list(db, Sale),
        "sale_items": _table_to_list(db, SaleItem),
        "orders": _table_to_list(db, Order),
        "order_items": _table_to_list(db, OrderItem),
        "cash_register": _table_to_list(db, CashRegister),
        "cash_movements": _table_to_list(db, CashMovement),
        "ingredients": _table_to_list(db, Ingredient),
        "ingredient_movements": _table_to_list(db, IngredientMovement),
        "audit_log": _table_to_list(db, AuditLog),
    }

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, default=_serialize)

    _rotate_backups()
    log_action(db, ACTIONS.BACKUP, None, f"Backup automático: {filename.name}")
    print(f"✓ Backup guardado en {filename}")
    return filename


def run_manual_backup(db: Session) -> str:
    """Backup manual desde el panel de configuración. Retorna la ruta del archivo."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    path = _run_backup(db)
    return str(path)
