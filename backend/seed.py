"""
Siembra de datos por rubro.

- seed_database(): corre al arrancar. NO crea vendedores en una DB fresca
  (eso lo hace el SetupWizard vía POST /api/setup). Solo asegura defaults
  inofensivos y, en instalaciones establecidas, garantiza categorías de gasto.
- seed_vertical(): llamado por POST /api/setup. Siembra las categorías de gasto
  del rubro elegido y, si es pastelería, los datos demo originales.
"""
from .auth import hash_pin
from .models import ExpenseCategory, Ingredient, Product, Seller, SystemConfig
from .verticals import get_vertical, DEFAULT_VERTICAL
from sqlalchemy.orm import Session


def _get_business_type(db: Session) -> str:
    item = db.query(SystemConfig).filter(SystemConfig.key == "business_type").first()
    return item.value if item and item.value else DEFAULT_VERTICAL


PRODUCTOS_DEMO = [
    # Vitrina
    {"name": "Torta de Chocolate", "category": "vitrina", "price": 3500, "slices": 10, "max_showcase_hours": 48},
    {"name": "Torta de Frutilla", "category": "vitrina", "price": 3200, "slices": 10, "max_showcase_hours": 36},
    {"name": "Torta Tres Leches", "category": "vitrina", "price": 3800, "slices": 12, "max_showcase_hours": 48},
    {"name": "Cheesecake", "category": "vitrina", "price": 4000, "slices": 8, "max_showcase_hours": 72},
    {"name": "Mil Hojas", "category": "vitrina", "price": 2800, "slices": 8, "max_showcase_hours": 24},
    {"name": "Pie de Limón", "category": "vitrina", "price": 2500, "slices": 8, "max_showcase_hours": 36},
    {"name": "Kuchen de Manzana", "category": "vitrina", "price": 2200, "slices": 8, "max_showcase_hours": 48},
    {"name": "Brazo de Reina", "category": "vitrina", "price": 1800, "slices": 6, "max_showcase_hours": 24},
    {"name": "Panqueques", "category": "vitrina", "price": 1200, "slices": 4, "max_showcase_hours": 12},
    {"name": "Torta Selva Negra", "category": "vitrina", "price": 4200, "slices": 12, "max_showcase_hours": 48},
    # Salados
    {"name": "Empanada de Pino", "category": "salados", "price": 1500, "slices": 1, "max_showcase_hours": 8},
    {"name": "Empanada de Queso", "category": "salados", "price": 1200, "slices": 1, "max_showcase_hours": 8},
    {"name": "Quiche Lorraine", "category": "salados", "price": 2500, "slices": 6, "max_showcase_hours": 24},
    {"name": "Strudel de Espinaca", "category": "salados", "price": 2200, "slices": 6, "max_showcase_hours": 24},
    {"name": "Pan Amasado", "category": "salados", "price": 800, "slices": 1, "max_showcase_hours": 12},
    # Encargo
    {"name": "Torta de Cumpleaños", "category": "encargo", "price": 18000, "slices": 16, "max_showcase_hours": 48},
    {"name": "Torta de Matrimonio", "category": "encargo", "price": 45000, "slices": 30, "max_showcase_hours": 48},
    {"name": "Cupcakes (docena)", "category": "encargo", "price": 9000, "slices": 12, "max_showcase_hours": 48},
    {"name": "Alfajores (docena)", "category": "encargo", "price": 7500, "slices": 12, "max_showcase_hours": 72},
    {"name": "Galletas Decoradas", "category": "encargo", "price": 5000, "slices": 12, "max_showcase_hours": 72},
    {"name": "Torta Temática", "category": "encargo", "price": 25000, "slices": 20, "max_showcase_hours": 48},
]

INGREDIENTES_DEMO = [
    {"name": "Harina", "unit": "kg", "current_stock": 25, "min_stock": 5, "last_price": 900},
    {"name": "Azúcar", "unit": "kg", "current_stock": 15, "min_stock": 3, "last_price": 1100},
    {"name": "Mantequilla", "unit": "kg", "current_stock": 8, "min_stock": 2, "last_price": 8500},
    {"name": "Huevos", "unit": "docena", "current_stock": 10, "min_stock": 3, "last_price": 3200},
    {"name": "Leche", "unit": "l", "current_stock": 20, "min_stock": 5, "last_price": 950},
]


def _seed_expense_categories(db: Session, business_type: str) -> None:
    """Agrega las categorías de gasto del rubro que aún no existan (idempotente).

    Compara por nombre contra TODA la tabla (incluidas las desactivadas), así una
    instalación existente recibe categorías nuevas sin duplicar ni resucitar las
    que el usuario haya desactivado.
    """
    existing = {c.name for c in db.query(ExpenseCategory).all()}
    for c in get_vertical(business_type).get("expense_categories", []):
        if c["name"] not in existing:
            db.add(ExpenseCategory(name=c["name"], description=c.get("description")))


def seed_database(db: Session) -> None:
    """Corre al arrancar. Asegura defaults inofensivos; no toca DBs ya pobladas."""
    # Default de configuración (umbral de semáforo de vitrina)
    if db.query(SystemConfig).filter(SystemConfig.key == "showcase_alert_hours").count() == 0:
        db.add(SystemConfig(key="showcase_alert_hours", value="24"))
        db.commit()

    # Instalación establecida (ya tiene vendedores): garantizar categorías de gasto
    # por retrocompatibilidad. Una DB fresca NO se siembra aquí — la maneja el wizard.
    if db.query(Seller).count() > 0:
        business_type = _get_business_type(db)
        _seed_expense_categories(db, business_type)
        db.commit()


def seed_vertical(db: Session, business_type: str) -> None:
    """Siembra inicial al completar el SetupWizard, según el rubro elegido."""
    _seed_expense_categories(db, business_type)

    if business_type == "pasteleria":
        for p in PRODUCTOS_DEMO:
            db.add(Product(**p))
        for i in INGREDIENTES_DEMO:
            db.add(Ingredient(**i))

    db.commit()
