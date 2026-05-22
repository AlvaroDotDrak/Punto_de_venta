# Tarea: Mejoras de backend (refactor + índices + SQLite pragmas)

Tres tareas independientes de backend. No tocar frontend ni crear migraciones de columnas nuevas.

---

## Tarea 1 — Extraer `compute_cost_per_unit` a `utils.py`

La lógica de cálculo de costo unitario está **duplicada** en `products.py` y `accounting.py`. Hay que extraerla a una función compartida en `backend/utils.py` y reemplazar los dos usos.

### 1.1 Agregar función en `backend/utils.py`

Al final del archivo, agregar:

```python
def compute_cost_per_unit(product, showcase_type: str | None = None) -> float | None:
    """
    Calcula el costo unitario de un producto.
    - Con receta: suma (last_price × quantity) de ingredientes / yield_qty
    - Sin receta: usa cost_price directo
    - showcase_type='trozado': divide el costo base entre product.slices
    """
    if product.recipes:
        ingredient_cost = sum(
            r.ingredient.last_price * r.quantity
            for r in product.recipes if r.ingredient and r.ingredient.last_price
        )
        yield_qty = product.recipes[0].yield_qty if product.recipes else None
        if not yield_qty or yield_qty <= 0:
            return None
        base_cost = ingredient_cost / yield_qty
        if showcase_type == "trozado" and product.slices and product.slices > 0:
            return round(base_cost / product.slices, 2)
        return round(base_cost, 2)
    if product.cost_price is not None:
        return product.cost_price
    return None
```

### 1.2 Reemplazar en `backend/routers/products.py`

Agregar import al inicio del archivo (junto a los demás imports de `..`):
```python
from ..utils import calculate_recipe_fraction, compute_cost_per_unit
```

Reemplazar el bloque de cálculo inline (líneas ~34-40):
```python
        # ANTES — eliminar esto:
        cost_per_unit = None
        if p.recipes:
            total = sum(r.ingredient.last_price * r.quantity for r in p.recipes if r.ingredient)
            yield_qty = p.recipes[0].yield_qty
            cost_per_unit = round(total / yield_qty, 2) if yield_qty > 0 else None
        elif p.cost_price is not None:
            cost_per_unit = p.cost_price

        # DESPUÉS — reemplazar con:
        cost_per_unit = compute_cost_per_unit(p)
```

### 1.3 Reemplazar en `backend/routers/accounting.py`

Agregar import:
```python
from ..utils import calculate_vat, compute_cost_per_unit
```

En la función `get_profitability` (líneas ~462-477), reemplazar el bloque de cálculo inline:
```python
        # ANTES — eliminar esto:
        cost_per_unit = None
        if product.recipes:
            ingredient_cost = sum(
                r.ingredient.last_price * r.quantity
                for r in product.recipes if r.ingredient
            )
            yield_qty = product.recipes[0].yield_qty
            if yield_qty and yield_qty > 0:
                base_cost = ingredient_cost / yield_qty
                if showcase_type == "trozado" and product.slices and product.slices > 0:
                    cost_per_unit = round(base_cost / product.slices, 2)
                else:
                    cost_per_unit = round(base_cost, 2)
        elif product.cost_price is not None:
            cost_per_unit = product.cost_price

        # DESPUÉS — reemplazar con:
        cost_per_unit = compute_cost_per_unit(product, showcase_type)
```

---

## Tarea 2 — Índices en SQLite

Agregar índices en `backend/main.py`, dentro de `_run_migrations()`, **después** de la última línea existente de `_add_column_if_missing`. Los índices usan `CREATE INDEX IF NOT EXISTS` (no necesitan try/except).

```python
        # Índices para consultas frecuentes (v2.8)
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sales_created_at ON sales(created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sales_status ON sales(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sale_items_sale_id ON sale_items(sale_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sale_items_product_id ON sale_items(product_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_showcase_product_status ON showcase_items(product_id, status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ingredient_movements_sale_id ON ingredient_movements(sale_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ingredient_movements_type ON ingredient_movements(type)"))
        conn.commit()
```

---

## Tarea 3 — FK constraints y WAL mode en `backend/database.py`

SQLite no aplica FK constraints por defecto, y el modo WAL mejora lecturas concurrentes. Agregar un event listener al engine.

En `backend/database.py`, agregar el import y el listener **después** de crear el engine:

```python
from sqlalchemy import create_engine, event   # agregar 'event' al import existente
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = "sqlite:///./pasteleria.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.execute("PRAGMA journal_mode = WAL")
    cursor.close()
```

El resto del archivo (`SessionLocal`, `Base`, `get_db`) no cambia.

---

## Verificación

- [x] `source .venv/bin/activate && python3 -c "from backend.main import app; print('OK')"` — sin errores de import
- [x] El servidor arranca con `bash inicio.sh` sin errores
- [x] `GET /api/products` sigue devolviendo productos con `cost_per_unit` correcto
- [x] `GET /api/accounting/profitability` sigue funcionando
- [x] **No hacer commit — esperar revisión**
