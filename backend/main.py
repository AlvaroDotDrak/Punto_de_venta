from dotenv import load_dotenv
load_dotenv()  # Cargar .env antes de importar cualquier módulo del backend

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from .database import Base, SessionLocal, engine
from .models import ProductRecipe  # Asegurar creación de la tabla
from .seed import seed_database
from .backup import check_and_run_backup
from .routers import auth, sellers, products, sales, showcase, cash, orders, ingredients, audit, config
from .routers import expenses, invoices, accounting, recipes


def _add_column_if_missing(conn, sql: str) -> None:
    """Ejecuta un ALTER TABLE ADD COLUMN ignorando solo el error de columna duplicada."""
    try:
        conn.execute(text(sql))
        conn.commit()
    except OperationalError as e:
        if "duplicate column name" in str(e).lower():
            pass  # columna ya existe — esperado en DBs existentes
        else:
            raise  # cualquier otro error es crítico (tabla no existe, SQL inválido, etc.)


def _run_migrations():
    """Migraciones manuales para columnas nuevas en tablas existentes."""
    with engine.connect() as conn:
        # v2.1: stock físico para bebidas
        _add_column_if_missing(conn, "ALTER TABLE products ADD COLUMN stock INTEGER")
        # v2.2: umbral de alerta semáforo para visicooler
        _add_column_if_missing(conn, "ALTER TABLE products ADD COLUMN min_stock_cooler INTEGER")
        # v2.3: precio por trozo configurable
        _add_column_if_missing(conn, "ALTER TABLE products ADD COLUMN slice_price REAL")
        # v2.4: notas al cerrar caja + vendedor en movimientos manuales
        _add_column_if_missing(conn, "ALTER TABLE cash_register ADD COLUMN notes TEXT")
        _add_column_if_missing(conn, "ALTER TABLE cash_movements ADD COLUMN seller_id INTEGER")
        # v2.5: campo has_receipt en sales (módulo contabilidad)
        _add_column_if_missing(conn, "ALTER TABLE sales ADD COLUMN has_receipt BOOLEAN DEFAULT 0")
        # v2.6: bloqueo de PIN persistido en DB (sobrevive reinicios del servidor)
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN failed_attempts INTEGER DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN locked_until DATETIME")
        # v2.7: tipo de documento en gastos (necesario para crédito fiscal IVA)
        _add_column_if_missing(conn, "ALTER TABLE expenses ADD COLUMN document_type TEXT DEFAULT 'boleta'")
        # v2.8: sale_id en movimientos de ingredientes (para revertir compras/usos al anular)
        _add_column_if_missing(conn, "ALTER TABLE ingredient_movements ADD COLUMN sale_id INTEGER")
        # v2.9: notes en movimientos de ingredientes (descripciones para mermas/ajustes)
        _add_column_if_missing(conn, "ALTER TABLE ingredient_movements ADD COLUMN notes TEXT")
        # v2.10: product_id en movimientos de ingredientes (para rentabilidad por producto)
        _add_column_if_missing(conn, "ALTER TABLE ingredient_movements ADD COLUMN product_id INTEGER")
        # v2.11: cost_price en productos para rentabilidad
        _add_column_if_missing(conn, "ALTER TABLE products ADD COLUMN cost_price FLOAT")

        # Índices para consultas frecuentes (v2.8)
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sales_created_at ON sales(created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sales_status ON sales(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sale_items_sale_id ON sale_items(sale_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sale_items_product_id ON sale_items(product_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_showcase_product_status ON showcase_items(product_id, status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ingredient_movements_sale_id ON ingredient_movements(sale_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ingredient_movements_type ON ingredient_movements(type)"))
        conn.commit()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear tablas si no existen (incluye las nuevas: expense_categories, expenses, invoices)
    Base.metadata.create_all(bind=engine)

    # Migraciones incrementales para columnas nuevas en tablas existentes
    _run_migrations()

    # Seed y backup automático al iniciar
    db = SessionLocal()
    try:
        seed_database(db)
        check_and_run_backup(db)
    finally:
        db.close()

    yield


app = FastAPI(
    title="Punto de Venta – Pastelería",
    version="2.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORS para desarrollo (Vite en :5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers de la API
app.include_router(auth.router, prefix="/api")
app.include_router(sellers.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(sales.router, prefix="/api")
app.include_router(showcase.router, prefix="/api")
app.include_router(cash.router, prefix="/api")
app.include_router(orders.router, prefix="/api")
app.include_router(ingredients.router, prefix="/api")
app.include_router(audit.router, prefix="/api")
app.include_router(config.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(invoices.router, prefix="/api")
app.include_router(accounting.router, prefix="/api")
app.include_router(recipes.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


# Servir el frontend React — debe ir AL FINAL para no capturar rutas /api
dist_path = Path(__file__).parent.parent / "dist"
if dist_path.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_path / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: sirve el archivo si existe, sino index.html (SPA routing)."""
        file_path = dist_path / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(dist_path / "index.html"))
