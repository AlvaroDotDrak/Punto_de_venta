"""
Backup automático a archivo JSON local, con restauración.
Equivalente a src/utils/autoBackup.js pero guarda en disco en vez de forzar descarga.
"""
import json
from datetime import datetime, date
from pathlib import Path
from sqlalchemy import DateTime, text
from sqlalchemy.orm import Session
from .database import engine, SessionLocal
from .models import (
    AuditLog, CashMovement, CashRegister, Expense, ExpenseCategory,
    Ingredient, IngredientMovement, Invoice, Order, OrderItem, Product,
    ProductRecipe, Sale, SaleItem, SalePayment, Seller, ShowcaseItem, Supplier,
    PurchaseItem, StockMovement, SupplierItemAlias, SystemConfig
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

# Claves de system_config que no salen en el backup. El archivo se manda por
# correo, y un secreto en texto plano ahí queda guardado en una casilla para
# siempre. Restaurar obliga a volver a escribirlo: sale mucho más barato que
# repartir la contraseña todos los días.
_EXCLUDE_CONFIG_KEYS = {"smtp_password"}

# Mapeo clave del JSON -> modelo. Define también el orden de inserción al
# restaurar: los foreign_keys quedan desactivados durante la restauración, así
# que el orden no es obligatorio, pero se mantiene padres-antes-que-hijos por
# claridad. Debe incluir TODAS las tablas del schema.
_MODELS_BY_KEY = {
    "sellers": Seller,
    "products": Product,
    "expense_categories": ExpenseCategory,
    "ingredients": Ingredient,
    "system_config": SystemConfig,
    "cash_register": CashRegister,
    "suppliers": Supplier,
    "orders": Order,
    "sales": Sale,
    "showcase_items": ShowcaseItem,
    "sale_items": SaleItem,
    "sale_payments": SalePayment,
    "order_items": OrderItem,
    "cash_movements": CashMovement,
    "ingredient_movements": IngredientMovement,
    "stock_movements": StockMovement,
    "product_recipes": ProductRecipe,
    "expenses": Expense,
    "purchase_items": PurchaseItem,
    "supplier_item_aliases": SupplierItemAlias,
    "invoices": Invoice,
    "audit_log": AuditLog,
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


def _export_data(db: Session) -> dict:
    """El contenido del backup, sin escribirlo a ningún lado."""
    data = {"exported_at": datetime.now().isoformat()}
    for key, model in _MODELS_BY_KEY.items():
        data[key] = _table_to_list(db, model, _EXCLUDE_FIELDS.get(key))
    data["system_config"] = [row for row in data["system_config"]
                             if row.get("key") not in _EXCLUDE_CONFIG_KEYS]
    return data


def build_mail_attachment(db: Session) -> tuple[str, bytes]:
    """Backup completo en memoria, para viajar pegado al correo del cierre.

    Va sin comprimir a propósito: pesa unos cientos de KB contra los 25 MB que
    admite un correo, y así el adjunto se carga directo en la pantalla de
    restauración, que espera un .json. Un .gz habría que descomprimirlo a mano
    justo el día que algo se rompió.
    """
    crudo = json.dumps(_export_data(db), ensure_ascii=False, default=_serialize)
    nombre = f"backup_{datetime.now().strftime('%Y-%m-%d')}.json"
    return nombre, crudo.encode("utf-8")


def _run_backup(db: Session) -> Path:
    """Exporta todas las tablas a un JSON con timestamp."""
    timestamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    filename = BACKUP_DIR / f"backup_{timestamp}.json"

    data = _export_data(db)

    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, default=_serialize)

    _rotate_backups()
    log_action(db, ACTIONS.BACKUP, None, f"Backup automático: {filename.name}")
    # Sin caracteres no-ASCII: en Windows con consola cp1252 (locale es-CL por
    # defecto), un print() con un carácter no codificable revienta el arranque
    # del servidor, justo durante el backup automático del startup.
    print(f"Backup guardado en {filename}")
    return filename


def run_manual_backup(db: Session) -> str:
    """Backup manual desde el panel de configuración. Retorna la ruta del archivo."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    path = _run_backup(db)
    return str(path)


def _clean_row(model, row: dict) -> dict:
    """Normaliza una fila del JSON a las columnas reales del modelo: rellena
    columnas ausentes (ej. 'photo', excluido del backup) con None y convierte
    fechas ISO ("...T...") a datetime, ya que el dialecto sqlite de SQLAlchemy
    espera el formato que usa al escribir ("... " con espacio, sin 'T')."""
    cleaned = {}
    for col in model.__table__.columns:
        val = row.get(col.name)
        if val is not None and isinstance(col.type, DateTime) and isinstance(val, str):
            val = datetime.fromisoformat(val)
        cleaned[col.name] = val
    return cleaned


def restore_from_backup(data: dict) -> dict:
    """
    Reemplaza TODOS los datos actuales por los del backup (borra e inserta).
    No es un merge: es una restauración completa, como volver a un punto en
    el tiempo. Se desactivan foreign_keys durante la operación porque el orden
    de inserción entre tablas con referencias cruzadas (ej. sales <-> orders)
    no puede respetarse perfectamente con un solo pase; al final se valida con
    PRAGMA foreign_key_check antes de confirmar.
    """
    counts = {}
    with engine.connect() as conn:
        # PRAGMA foreign_keys es no-op dentro de una transacción, así que debe
        # ejecutarse antes que cualquier otra sentencia (que dispararía el
        # autobegin de SQLAlchemy 2.0 e implícitamente abriría una).
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        try:
            for model in _MODELS_BY_KEY.values():
                conn.execute(model.__table__.delete())

            for key, model in _MODELS_BY_KEY.items():
                rows = data.get(key) or []
                if rows:
                    conn.execute(model.__table__.insert(), [_clean_row(model, r) for r in rows])
                counts[key] = len(rows)

            violations = conn.execute(text("PRAGMA foreign_key_check")).fetchall()
            if violations:
                conn.rollback()
                raise ValueError(f"Backup con referencias inconsistentes: {violations[:5]}")

            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.execute(text("PRAGMA foreign_keys = ON"))

    # Fuerza que el pool reabra conexiones nuevas (con foreign_keys=ON aplicado
    # de nuevo por el listener de connect en database.py).
    engine.dispose()
    return counts
