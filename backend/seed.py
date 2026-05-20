"""
Puebla la base de datos con datos de demo si está vacía.
Equivalente a src/utils/seedData.js
"""
from .auth import hash_pin
from .models import ExpenseCategory, Ingredient, Product, Seller, SystemConfig
from sqlalchemy.orm import Session


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


def seed_database(db: Session) -> None:
    """Puebla la DB si está vacía. Solo corre una vez."""

    # Siempre asegurar categorías de gasto, independiente del estado de la DB
    if db.query(ExpenseCategory).count() == 0:
        default_categories = [
            ExpenseCategory(name="Insumos", description="Materias primas y productos para elaboración"),
            ExpenseCategory(name="Arriendo", description="Arriendo del local"),
            ExpenseCategory(name="Electricidad", description="Cuenta de luz"),
            ExpenseCategory(name="Gas", description="Gas para hornos y cocina"),
            ExpenseCategory(name="Agua", description="Cuenta de agua"),
            ExpenseCategory(name="Sueldos", description="Remuneraciones del personal"),
            ExpenseCategory(name="Transporte", description="Fletes, combustible, despachos"),
            ExpenseCategory(name="Mantención", description="Reparaciones y mantención de equipos"),
            ExpenseCategory(name="Marketing", description="Publicidad, redes sociales, packaging"),
            ExpenseCategory(name="Otros", description="Gastos no categorizados"),
        ]
        db.add_all(default_categories)
        db.commit()

    # Siempre asegurar configuraciones por defecto
    if db.query(SystemConfig).filter(SystemConfig.key == "showcase_alert_hours").count() == 0:
        db.add(SystemConfig(key="showcase_alert_hours", value="24"))
        db.commit()

    if db.query(Seller).count() > 0:
        return

    # Vendedores demo
    admin = Seller(name="Admin", pin=hash_pin("1234"), role="admin", active=True)
    vendedor = Seller(name="Vendedor 1", pin=hash_pin("0000"), role="seller", active=True)
    db.add_all([admin, vendedor])

    # Productos demo
    for p in PRODUCTOS_DEMO:
        db.add(Product(**p))

    # Ingredientes demo
    for i in INGREDIENTES_DEMO:
        db.add(Ingredient(**i))

    db.commit()
    print("✓ Base de datos inicializada con datos de demo")
