from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .database import Base, SessionLocal, engine
from .seed import seed_database
from .backup import check_and_run_backup
from .routers import auth, sellers, products, sales, showcase, cash, orders, ingredients, audit, config


def _run_migrations():
    """Migraciones manuales para columnas nuevas en tablas existentes."""
    with engine.connect() as conn:
        # v2.1: columna stock en products (bebidas/café)
        try:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE products ADD COLUMN stock INTEGER"
            ))
            conn.commit()
        except Exception:
            pass  # ya existe

        # v2.2: umbral de alerta semáforo para visicooler
        try:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE products ADD COLUMN min_stock_cooler INTEGER"
            ))
            conn.commit()
        except Exception:
            pass  # ya existe

        # v2.3: precio por trozo configurable
        try:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE products ADD COLUMN slice_price REAL"
            ))
            conn.commit()
        except Exception:
            pass  # ya existe

        # v2.4: notas al cerrar caja + método de pago en movimientos manuales
        try:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE cash_register ADD COLUMN notes TEXT"
            ))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(__import__("sqlalchemy").text(
                "ALTER TABLE cash_movements ADD COLUMN seller_id INTEGER"
            ))
            conn.commit()
        except Exception:
            pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear tablas si no existen
    Base.metadata.create_all(bind=engine)

    # Migraciones incrementales
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


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


# Servir el frontend React — debe ir AL FINAL para no capturar rutas /api
dist_path = Path(__file__).parent.parent / "dist"
if dist_path.exists():
    # Archivos estáticos con nombre explícito (JS, CSS, iconos, sw.js, etc.)
    app.mount("/assets", StaticFiles(directory=str(dist_path / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: sirve el archivo si existe, sino index.html (SPA routing)."""
        file_path = dist_path / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(dist_path / "index.html"))
