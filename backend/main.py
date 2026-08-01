from dotenv import load_dotenv
load_dotenv()  # Cargar .env antes de importar cualquier módulo del backend

import sys
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from .database import Base, SessionLocal, engine
from .models import ProductRecipe, SupplierItemAlias  # Asegurar creación de las tablas
from .seed import seed_database
from .utils import normalize_description
from .backup import check_and_run_backup
from .routers import auth, sellers, products, sales, showcase, cash, orders, ingredients, audit, config
from .routers import expenses, invoices, accounting, recipes, suppliers, purchases, printing


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


def _backfill_item_aliases(conn) -> None:
    """v2.21: siembra los alias de escaneo con las compras ya cargadas — cada línea
    histórica que se asignó a un producto/insumo ya es una confirmación del admin.
    Corre una sola vez (marca en system_config); el factor de pack queda en 1 porque
    las compras viejas se cargaron en unidades de inventario."""
    ya_corrio = conn.execute(
        text("SELECT 1 FROM system_config WHERE key='aliases_backfilled'")
    ).fetchone()
    if ya_corrio:
        return

    filas = conn.execute(text(
        "SELECT e.supplier_id, pi.description, pi.product_id, pi.ingredient_id "
        "FROM purchase_items pi JOIN expenses e ON e.id = pi.expense_id "
        "WHERE e.supplier_id IS NOT NULL "
        "  AND (pi.product_id IS NOT NULL OR pi.ingredient_id IS NOT NULL) "
        "ORDER BY pi.id ASC"
    )).fetchall()

    # El orden ascendente hace que la asignación más reciente pise a las viejas.
    aliases = {}
    for supplier_id, description, product_id, ingredient_id in filas:
        clave = (supplier_id, normalize_description(description))
        if not clave[1]:
            continue
        aliases[clave] = (description, product_id, ingredient_id)

    for (supplier_id, norm), (raw, product_id, ingredient_id) in aliases.items():
        conn.execute(text(
            "INSERT OR IGNORE INTO supplier_item_aliases "
            "(supplier_id, normalized_description, raw_description, product_id, "
            " ingredient_id, units_per_pack, times_seen, updated_at) "
            "VALUES (:sid, :norm, :raw, :pid, :iid, 1, 1, :now)"
        ), {"sid": supplier_id, "norm": norm, "raw": raw, "pid": product_id,
            "iid": ingredient_id, "now": datetime.now()})

    conn.execute(text("INSERT INTO system_config (key, value) VALUES ('aliases_backfilled', 'true')"))
    conn.commit()


def _backfill_noncash_movements(conn) -> None:
    """v2.24: hasta ahora solo las ventas en efectivo dejaban CashMovement, así que
    las cajas cerradas muestran $0 en tarjeta y transferencia. Reconstruye esos
    movimientos cruzando cada caja con las ventas de su ventana horaria.

    Solo ventas 'completed': una venta anulada necesitaría su par sale+void para
    netear, y omitir ambas da el mismo total con la mitad de filas.
    Corre una sola vez (marca en system_config)."""
    ya_corrio = conn.execute(
        text("SELECT 1 FROM system_config WHERE key='noncash_movements_backfilled'")
    ).fetchone()
    if ya_corrio:
        return

    registers = conn.execute(text(
        "SELECT id, opened_at, closed_at FROM cash_register WHERE closed_at IS NOT NULL"
    )).fetchall()

    for register_id, opened_at, closed_at in registers:
        conn.execute(text(
            "INSERT INTO cash_movements "
            "  (register_id, type, amount, payment_method, sale_id, seller_id, created_at) "
            "SELECT :rid, 'sale', s.total, s.payment_method, s.id, s.seller_id, s.created_at "
            "FROM sales s "
            "WHERE s.status = 'completed' "
            "  AND s.payment_method != 'efectivo' "
            "  AND s.created_at >= :desde AND s.created_at <= :hasta "
            "  AND NOT EXISTS (SELECT 1 FROM cash_movements cm WHERE cm.sale_id = s.id)"
        ), {"rid": register_id, "desde": opened_at, "hasta": closed_at})

    conn.execute(text(
        "INSERT INTO system_config (key, value) VALUES ('noncash_movements_backfilled', 'true')"
    ))
    conn.commit()


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

        # v2.12: permisos granulares por vendedor
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN products_access TEXT DEFAULT 'none'")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_access_insumos BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_access_historial BOOLEAN DEFAULT 0")

        # permisos granulares de vendedores
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_void_sales BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_close_cash BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_cash_movements BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_view_costs BOOLEAN DEFAULT 0")

        # v2.14: modo de venta (unidad/peso) para congelados por kg
        _add_column_if_missing(conn, "ALTER TABLE products ADD COLUMN sold_by TEXT DEFAULT 'unit'")
        # v2.15: kg vendidos en items de venta por peso
        _add_column_if_missing(conn, "ALTER TABLE sale_items ADD COLUMN weight FLOAT")
        # v2.16: código de barras en productos (retail: botillería, minimarket)
        _add_column_if_missing(conn, "ALTER TABLE products ADD COLUMN barcode TEXT")
        # v2.17: proveedor en gastos (Fase 1 — compras)
        _add_column_if_missing(conn, "ALTER TABLE expenses ADD COLUMN supplier_id INTEGER")
        # v2.18: método de pago en gastos/compras (Fase 2)
        _add_column_if_missing(conn, "ALTER TABLE expenses ADD COLUMN payment_method TEXT")
        # v2.19: categoría de gasto por línea de compra (sub-categorizar una factura mixta)
        _add_column_if_missing(conn, "ALTER TABLE purchase_items ADD COLUMN category_id INTEGER")
        # v2.20: trazabilidad de quién abre y cierra la caja
        _add_column_if_missing(conn, "ALTER TABLE cash_register ADD COLUMN opened_by TEXT")
        _add_column_if_missing(conn, "ALTER TABLE cash_register ADD COLUMN closed_by TEXT")
        # v2.21: la factura vende packs, el inventario cuenta unidades sueltas
        _add_column_if_missing(conn, "ALTER TABLE purchase_items ADD COLUMN units_per_pack FLOAT DEFAULT 1")
        # v2.22: vincular el movimiento de insumo a su compra, para poder revertirla
        # con exactitud (antes había que adivinar por el texto de notes)
        _add_column_if_missing(conn, "ALTER TABLE ingredient_movements ADD COLUMN expense_id INTEGER")
        # v2.23: cargos no afectos a IVA (IABA/ILA) — suman al total sin base imponible
        _add_column_if_missing(conn, "ALTER TABLE purchase_items ADD COLUMN taxable BOOLEAN DEFAULT 1")
        # v2.24: ver totales del negocio (ventas, tarjeta, transferencia) en Caja
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_view_totals BOOLEAN DEFAULT 0")
        # v2.25: retiros de efectivo (sangría) y vínculo gasto ↔ movimiento de caja
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_withdraw_cash BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE cash_movements ADD COLUMN expense_id INTEGER")
        # v2.26: folio del documento del proveedor, para detectar facturas cargadas dos veces
        _add_column_if_missing(conn, "ALTER TABLE expenses ADD COLUMN invoice_number TEXT")
        # v2.27: descuento configurable sobre el total de la venta
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_apply_discount BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sales ADD COLUMN subtotal FLOAT")
        _add_column_if_missing(conn, "ALTER TABLE sales ADD COLUMN discount_percent FLOAT DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sales ADD COLUMN discount_amount FLOAT DEFAULT 0")
        # v2.28: cortesías (producto que sale sin cobrarse) con su motivo
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_give_courtesy BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sales ADD COLUMN notes TEXT")

        # Índices para consultas frecuentes (v2.8)
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sales_created_at ON sales(created_at)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sales_status ON sales(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sale_items_sale_id ON sale_items(sale_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_sale_items_product_id ON sale_items(product_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_showcase_product_status ON showcase_items(product_id, status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ingredient_movements_sale_id ON ingredient_movements(sale_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ingredient_movements_type ON ingredient_movements(type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_products_barcode ON products(barcode)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_items_expense_id ON purchase_items(expense_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_items_product_id ON purchase_items(product_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_items_ingredient_id ON purchase_items(ingredient_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ingredient_movements_expense_id ON ingredient_movements(expense_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cash_movements_expense_id ON cash_movements(expense_id)"))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_expenses_supplier_invoice "
            "ON expenses(supplier_id, invoice_number)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_alias_supplier_desc "
            "ON supplier_item_aliases(supplier_id, normalized_description)"
        ))
        conn.commit()

        _backfill_item_aliases(conn)
        _backfill_noncash_movements(conn)

        # v2.13: marca de rubro (multi-vertical). Una instalación legacy ya poblada
        # (tiene vendedores) se auto-marca como pastelería ya configurada para no
        # mostrarle el SetupWizard ni cambiar su comportamiento. Una DB fresca queda
        # sin marcar → el wizard se encarga.
        has_business_type = conn.execute(
            text("SELECT 1 FROM system_config WHERE key='business_type'")
        ).fetchone()
        if has_business_type is None:
            seller_count = conn.execute(text("SELECT COUNT(*) FROM sellers")).scalar()
            if seller_count and seller_count > 0:
                conn.execute(text(
                    "INSERT INTO system_config (key, value) VALUES "
                    "('business_type', 'pasteleria'), ('setup_complete', 'true')"
                ))
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
app.include_router(suppliers.router, prefix="/api")
app.include_router(purchases.router, prefix="/api")
app.include_router(printing.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"ok": True}


# Servir el frontend React — debe ir AL FINAL para no capturar rutas /api
# Empaquetado con PyInstaller: el dist/ se extrae en sys._MEIPASS. En ejecución
# normal (dev/uvicorn) está junto al código fuente.
if getattr(sys, "frozen", False):
    dist_path = Path(sys._MEIPASS) / "dist"
else:
    dist_path = Path(__file__).parent.parent / "dist"
if dist_path.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_path / "assets")), name="assets")

    # El shell de la SPA (index.html) y el service worker nunca se cachean: así
    # una actualización (npm run build) se toma con un reload normal, sin Ctrl+F5.
    # Los assets con hash sí pueden cachearse — su nombre cambia en cada build.
    _NO_CACHE = {"Cache-Control": "no-cache, must-revalidate"}

    _dist_root = dist_path.resolve()

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: sirve el archivo si existe, sino index.html (SPA routing).

        Resuelve la ruta y confirma que quede dentro de dist/ antes de servirla:
        sin esto, un `..%2f` en la URL escaparía a archivos del sistema (ej. .env).
        """
        file_path = (dist_path / full_path).resolve()
        within_dist = file_path == _dist_root or _dist_root in file_path.parents
        if within_dist and file_path.is_file():
            if file_path.name in ("index.html", "sw.js"):
                return FileResponse(str(file_path), headers=_NO_CACHE)
            return FileResponse(str(file_path))
        return FileResponse(str(dist_path / "index.html"), headers=_NO_CACHE)
