from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import Base, SessionLocal, engine
from .seed import seed_database
from .backup import check_and_run_backup
from .routers import auth, sellers, products, sales, showcase, cash, orders, ingredients, audit, config


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crear tablas si no existen
    Base.metadata.create_all(bind=engine)

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
    app.mount("/", StaticFiles(directory=str(dist_path), html=True), name="frontend")
