# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Descripción del proyecto

**Punto de Venta – Pastelería** es una aplicación POS (Point of Sale) para una panadería/pastelería.
Tiene un **backend FastAPI + SQLite** que sirve la API REST, y un **frontend React** compilado a `dist/` que el propio backend sirve como SPA.

---

## Stack tecnológico

### Backend

| Capa | Tecnología |
|---|---|
| Framework | FastAPI (Python) |
| ORM | SQLAlchemy (SQLite) |
| Base de datos | SQLite → archivo `pasteleria.db` |
| Auth | JWT (`python-jose`) + SHA-256 (`hashlib`) para PINs |
| Reportes | openpyxl (export contable a Excel) |
| Servidor | Uvicorn |
| Migraciones | Manual (`ALTER TABLE` en `main.py::_run_migrations`) — no usa Alembic |

### Frontend

| Capa | Tecnología |
|---|---|
| UI | React 18 + JSX (sin TypeScript) |
| Routing | React Router v6 |
| Build | Vite 6 |
| Gráficos | Chart.js 4 + react-chartjs-2 |
| Fechas | date-fns v4 (locale es-CL) |
| Iconos | lucide-react |
| Fuentes | Plus Jakarta Sans + Fraunces (Google Fonts) |
| Tests | Vitest + @testing-library/react |
| Lint | ESLint v9 flat config |

---

## Cómo iniciar la aplicación

```bash
bash inicio.sh
```

El script:
1. Crea `.venv` si no existe e instala `requirements.txt`
2. Activa el entorno virtual
3. Lanza `uvicorn backend.main:app --host 0.0.0.0 --port 8000`
4. Abre el browser en `http://localhost:8000` (si hay GUI)

La app completa (API + frontend) queda en **http://localhost:8000**.

### Desarrollo frontend

```bash
npm run dev      # Dev server en http://localhost:5173 (proxy → :8000)
npm run build    # Compila React → dist/ (necesario para producción)
npm run test     # Vitest
npx eslint src/
```

> **Importante**: tras cada cambio en el frontend, ejecutar `npm run build` para que el backend sirva la versión actualizada.

---

## Arquitectura

### Flujo general

```
Browser
  ↕ HTTP (fetch via src/utils/api.js)
FastAPI (puerto 8000)
  ├─ /api/*  → Routers de la API
  └─ /*      → Sirve dist/index.html (SPA catch-all)
      ↕ SQLAlchemy ORM
  SQLite (pasteleria.db)
```

### Árbol del proyecto

```
/
├── backend/
│   ├── main.py          Lifespan, CORS, include routers, SPA catch-all, _run_migrations()
│   ├── models.py        Modelos SQLAlchemy (tablas)
│   ├── schemas.py       Pydantic schemas (request/response)
│   ├── database.py      Engine, SessionLocal, Base, get_db
│   ├── auth.py          JWT, hash_pin (SHA-256), get_current_seller, require_admin
│   ├── audit.py         log_action, ACTIONS constants
│   ├── seed.py          seed_database() — datos demo + categorías de gasto al iniciar
│   ├── backup.py        check_and_run_backup()
│   └── routers/
│       ├── auth.py          POST /api/login, GET /api/me
│       ├── sellers.py       CRUD vendedores
│       ├── products.py      CRUD productos + POST /restock + GET /{id}/stats
│       ├── sales.py         CRUD ventas + POST /void
│       ├── showcase.py      CRUD vitrina (showcaseItems)
│       ├── cash.py          Caja registradora (open/close/movements)
│       ├── orders.py        Pedidos/encargos
│       ├── ingredients.py   Ingredientes y movimientos
│       ├── audit.py         GET audit log
│       ├── config.py        Configuración global
│       ├── expenses.py      CRUD gastos + CRUD categorías de gasto
│       ├── invoices.py      CRUD facturas (boletas empresa)
│       └── accounting.py    GET /summary + GET /export (Excel)
├── src/
│   ├── main.jsx         Entry point (BrowserRouter > ToastProvider > SellerProvider > App)
│   ├── App.jsx          Shell: rutas React Router + AdminRoute guard
│   ├── pages/
│   │   ├── SellerSelect.jsx      Selección de usuario con PIN
│   │   ├── Ventas.jsx            Punto de venta (POS)
│   │   ├── Vitrina.jsx           Control de frescura de vitrina
│   │   ├── Visicooler.jsx        Control de stock bebidas/visicooler
│   │   ├── Pedidos.jsx           Pedidos por encargo
│   │   ├── Productos.jsx         Catálogo CRUD + estadísticas
│   │   ├── Insumos.jsx           Ingredientes y movimientos
│   │   ├── Dashboard.jsx         Métricas y gráficos
│   │   ├── HistorialVentas.jsx   Historial con anulación (admin)
│   │   ├── Vendedores.jsx        CRUD vendedores (admin)
│   │   ├── Configuracion.jsx     Ajustes del sistema (admin)
│   │   ├── Gastos.jsx            Registro de gastos operativos
│   │   ├── Contabilidad.jsx      Resumen contable + export Excel (admin)
│   │   └── Facturas.jsx          Registro de facturas a empresas (admin)
│   ├── components/
│   │   ├── Layout/               Sidebar + Header
│   │   ├── Ventas/               TypeModal, PaymentModal, ReceiptModal
│   │   └── ProductStatsModal.jsx Modal de estadísticas por producto
│   ├── context/                  SellerContext + ToastContext
│   └── utils/
│       ├── api.js                fetch wrapper (base URL /api, Bearer token automático)
│       └── formatters.js         formatCurrency, formatDate, getFreshnessStatus, y más
├── inicio.sh            Script de inicio (Linux)
├── inicio.bat           Script de inicio (Windows)
├── requirements.txt     Dependencias Python (versiones fijadas)
└── dist/                Build de producción (generado por npm run build)
```

### Comunicación frontend → backend

El frontend usa `src/utils/api.js` que hace fetch a `/api/*` con el JWT Bearer token del `sessionStorage`. En desarrollo, Vite tiene un proxy configurado hacia `:8000`. En producción, el mismo backend sirve el `dist/` y no hace falta proxy.

---

## Base de datos (SQLite / SQLAlchemy)

### Modelos y campos clave

| Tabla | Campos destacados |
|---|---|
| `sellers` | `pin` (SHA-256 hash), `role` ('admin'\|'seller'), `active`, `failed_attempts`, `locked_until` |
| `products` | `category` (vitrina\|salados\|encargo\|bebidas\|cafe), `slices` (trozos/unidad), `slice_price` (precio por trozo nullable), `max_showcase_hours`, `stock` (Integer nullable — solo bebidas), `min_stock_cooler` (umbral alerta visicooler), `photo` (base64) |
| `showcase_items` | `showcase_type` ('entero'\|'trozado'), `status` ('active'\|'sold'\|'removed'\|'sliced'), `parent_id` (trozo → entero original) |
| `sales` | `status` ('completed'\|'voided'), `voided_at`, `void_reason`, `payment_method`, `has_receipt` (Boolean) |
| `sale_items` | snapshot de nombre/precio, `showcase_type` |
| `orders` | `status` ('pendiente'\|'en_produccion'\|'listo'\|'entregado'), `advance`, `balance` |
| `cash_register` | `status` ('open'\|'closed'), `opening_amount`, `closing_amount`, `expected_amount`, `notes` |
| `cash_movements` | `type` ('sale'\|'expense'\|'income'\|'void'), `payment_method`, `seller_id` (FK nullable) |
| `ingredients` | `unit`, `current_stock`, `min_stock`, `last_price` |
| `expense_categories` | `name`, `description`, `active` |
| `expenses` | `category_id` (FK), `amount`, `description`, `receipt_photo` (base64 nullable), `document_type` ('boleta'\|'factura', default 'boleta'), `seller_id` (FK) |
| `invoices` | `invoice_number` (único), `rut`, `business_name`, `net_amount`, `tax_amount`, `total_amount`, `sale_id` (FK nullable), `description` |
| `audit_log` | `action`, `seller_id`, `details` |

### Migraciones

No hay Alembic. Las columnas nuevas se agregan en `backend/main.py::_run_migrations()` como `ALTER TABLE ... ADD COLUMN` dentro de un try/except (falla silenciosamente si ya existe). Las tablas **nuevas** (expense_categories, expenses, invoices) se crean vía `Base.metadata.create_all()` al arrancar.

```python
def _run_migrations():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE products ADD COLUMN stock INTEGER"))
            conn.commit()
        except Exception:
            pass  # ya existe
```

Migraciones actuales (en orden):
- v2.1: `products.stock`
- v2.2: `products.min_stock_cooler`
- v2.3: `products.slice_price`
- v2.4: `cash_register.notes`, `cash_movements.seller_id`
- v2.5: `sales.has_receipt`
- v2.6: `sellers.failed_attempts`, `sellers.locked_until` (bloqueo PIN persistido en DB)
- v2.7: `expenses.document_type` (crédito fiscal IVA; default 'boleta')

**Siempre usar `datetime.now()`, nunca `datetime.utcnow()`** — la DB guarda hora local chilena. `utcnow()` causa que los filtros de fecha fallen y que los JWT expiren 3-4h antes de lo esperado.

---

## Autenticación y roles

- JWT Bearer token. El frontend lo guarda en `sessionStorage` (se borra al cerrar pestaña).
- El PIN se almacena como SHA-256 con salt fijo. En `auth.py`: `hashlib.sha256(f"{pin}{SALT}".encode()).hexdigest()`.
- Roles: `'admin'` y `'seller'`.
  - **Admin**: acceso a todas las rutas, incluido Contabilidad, Facturas, Productos, Insumos, Dashboard, Historial, Vendedores, Configuración.
  - **Seller**: Ventas, Vitrina, Visicooler, Caja, Pedidos, **Gastos** (puede registrar gastos, solo ve los de hoy).
- Bloqueo de PIN: 3 intentos fallidos → 5 minutos, **persistido en SQLite** (`sellers.failed_attempts`, `sellers.locked_until`). Sobrevive reinicios del servidor. El frontend refleja el estado (dots, countdown) pero no es la fuente de verdad.
- Dependencias de FastAPI: `get_current_seller` (cualquier vendedor autenticado), `require_admin` (solo admin).

---

## Lógica de negocio crítica

### Categorías de productos

```
vitrina   → tortas y pasteles en la vitrina refrigerada (se venden por entero o trozo)
salados   → empanadas, sándwiches, etc.
encargo   → tortas de encargo (no aparecen en vitrina ni en POS showcase)
bebidas   → visicooler (agua, bebidas, energéticas) — tienen stock físico numérico
cafe      → café de máquina — sin tracking de stock
```

### Stock de vitrina (showcase items)

La lógica más compleja. Al vender "1 trozo" en el backend (`sales.py::_handle_showcase_stock`):

1. Buscar `showcaseItem` con `{ product_id, status: 'active', showcase_type: 'trozado' }`.
2. Si existe → marcar `status: 'sold'`.
3. Si **no** existe → buscar un `entero` activo:
   - Marcar entero como `status: 'sliced'`
   - Crear `(product.slices - 1)` nuevos registros `trozado` con `parent_id`
   - El trozo vendido va directo como `status: 'sold'`

Al vender un "entero": buscar `{ showcase_type: 'entero', status: 'active' }` y marcarlo `sold`.

### Stock físico de bebidas

- `product.stock` es un `Integer` nullable. `null` = sin tracking. Número = unidades disponibles.
- Al vender una bebida (`sales.py`), el stock se decrementa automáticamente. Si `stock < quantity` → HTTP 400.
- Para reponer stock: `POST /api/products/{id}/restock` con `{ "quantity": N }` (solo admin).
- En `Ventas.jsx`, los productos con `stock == 0` aparecen deshabilitados ("Sin stock").
- Las bebidas **no** aparecen en el dropdown de Vitrina (son del visicooler, no la vitrina de pasteles).

### Caja / movimientos de efectivo

- La caja debe estar **abierta** para registrar ventas.
- Solo el método `efectivo` suma al `expected_amount` al cierre.
- Al anular una venta en efectivo, se crea un `CashMovement` con `amount` negativo (`type: 'void'`).

### Anulación de ventas (void)

1. Marcar `sale.status = 'voided'` con razón (mínimo 10 caracteres). Solo admin.
2. Revertir `showcase_items` asociados a `status: 'active'`.
3. Si pago era `efectivo` y hay caja abierta → crear movimiento negativo.
4. Registrar en audit log.

### Boleta (`has_receipt`)

- `sale.has_receipt` se fuerza a `True` cuando el método de pago es `tarjeta` (Mercado Pago emite boleta automáticamente).
- Para efectivo y transferencia, el vendedor elige en `PaymentModal` si emitir boleta.
- El módulo de Contabilidad usa este campo para el reporte de boletas emitidas vs. sin boleta.

### Gastos operativos

- Los gastos se clasifican por `ExpenseCategory`. Categorías predefinidas en seed: Insumos, Arriendo, Electricidad, Gas, Agua, Sueldos, Transporte, Mantención, Marketing, Otros.
- Cualquier vendedor puede registrar un gasto. Solo admin puede editarlos, eliminarlos o verlos fuera del día actual.
- El comprobante de gasto (foto de boleta) se guarda como base64 en `expense.receipt_photo`.

### Facturas a empresas

- `invoice_number` es único — el backend devuelve HTTP 409 si se intenta duplicar.
- El IVA (19%) se calcula automáticamente si no se especifica `tax_amount`.
- Una factura puede vincularse opcionalmente a una `sale_id`.

### Módulo de Contabilidad

- `GET /api/accounting/summary?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` → resumen de ingresos, gastos, facturas y boletas para el rango.
- `GET /api/accounting/export?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD` → genera Excel (openpyxl) con 3 hojas: Resumen, Detalle Ventas (solo completadas), Detalle Gastos. Solo admin.
- El export filtra ventas anuladas — solo aparecen ventas `status = 'completed'`.

### Backup automático

`check_and_run_backup()` en `backend/backup.py` se ejecuta al iniciar. Genera un archivo JSON descargable si pasaron 24h desde el último backup (clave `lastAutoBackupDate` en el sistema).

---

## Convenciones de código

### Nombrado

- **Archivos de páginas**: PascalCase en español (`HistorialVentas.jsx`, `SellerSelect.jsx`)
- **Componentes**: PascalCase (`ProductInfoTooltip.jsx`, `ProductStatsModal.jsx`)
- **Utilidades**: camelCase (`formatters.js`, `api.js`)
- **Variables/funciones**: camelCase en español (`currentSeller`, `vendedores`, `calcularTotal`)
- **Constantes de acciones audit**: UPPER_SNAKE_CASE en `ACTIONS` object (`backend/audit.py`)

### Estructura para agregar una nueva página

1. Crear `src/pages/NombrePagina.jsx`
2. Agregar ruta en `App.jsx` (usar `<AdminRoute>` si es solo admin)
3. Agregar ítem en `src/components/Layout/Sidebar.jsx` (con `adminOnly: true` si aplica)

### Manejo de errores (frontend)

```jsx
try {
  const data = await api.post('/endpoint', payload);
  toast.success('Éxito');
} catch (err) {
  console.error('Contexto:', err);
  toast.error('Error: ' + err.message);
}
```

### Formateo de datos

Usar siempre los helpers de `src/utils/formatters.js`:
- `formatCurrency(amount)` → `"$1.500"` (CLP, sin decimales)
- `formatDate(date)` → `"Hoy, 14:30"`, `"Ayer, 09:15"`, o `"15 ene 2026, 10:00"`
- `formatShortDate(date)` → `"15/01/2026"`
- `formatTimeAgo(date)` → `"hace 2 horas"`
- `formatElapsedTime(date)` → `"2h 15m"`
- `formatTimeRemaining(date, maxHours)` → `"Vence en 3h 30m"` o `"Venció hace 45m"`
- `getFreshnessStatus(placedAt, maxHours)` → `'fresh'|'warning'|'danger'`

### Registro de auditoría (backend)

```python
from ..audit import ACTIONS, log_action
log_action(db, ACTIONS.SALE, seller.id, f"Venta ${total:.0f}")
```

Constantes disponibles en `ACTIONS`: `LOGIN`, `LOGOUT`, `SALE`, `VOID_SALE`, `CASH_OPEN`, `CASH_CLOSE`, `CASH_MOVEMENT`, `PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_DELETE`, `SHOWCASE_ADD`, `SHOWCASE_REMOVE`, `SHOWCASE_EXTEND`, `SHOWCASE_SLICE`, `ORDER_CREATE`, `ORDER_UPDATE`, `SELLER_CREATE`, `SELLER_UPDATE`, `INGREDIENT_CREATE`, `INGREDIENT_MOVEMENT`, `BACKUP`, `IMPORT_DATA`, `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_DELETED`, `EXPENSE_CATEGORY_CREATED`, `EXPENSE_CATEGORY_UPDATED`, `INVOICE_CREATED`, `ACCOUNTING_EXPORT`.

Agregar nuevas constantes al objeto `ACTIONS` en `backend/audit.py`.

---

## CSS / Diseño

El sistema usa custom properties definidas en `src/index.css`:

```css
--color-primary: #BF5A2F   /* naranja tostado */
--color-bg: #F5EFE6         /* crema */
--color-bg-sidebar: #120A04 /* casi negro */
--font-body: "Plus Jakarta Sans"
--font-heading: "Fraunces"
```

Clases de utilidad clave:
- `vt-*` → componentes de la página Vitrina (vt-card, vt-badge, vt-progress-*, etc.)
- `pos-*` → componentes del POS (pos-layout, pos-product-btn, pos-cart-*, etc.)
- `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-sm`, `btn-danger`
- `modal-overlay`, `modal`, `modal-header`, `modal-body`, `modal-footer`
- `page-header`, `page-title`
- `badge`, `badge-info`, `badge-success`, `badge-danger`
- `card`, `form-group`, `form-label`, `form-input`, `form-select`

Los modales usan `align-items: flex-start` + `overflow-y: auto` en el overlay para que funcionen correctamente con contenido largo.

---

## Tests

- Tests en `tests/` con extensión `.test.jsx`
- Usan su propia instancia Dexie con `fake-indexeddb` (legacy, del antes de la migración a FastAPI)
- Correr: `npx vitest tests/StockLogic.test.jsx` o `npx vitest --watch`

---

## Deuda técnica conocida

| Área | Problema |
|---|---|
| Tests | Solo 1 archivo de tests, cobertura mínima, no prueban la API FastAPI |
| Sin CI/CD | No hay GitHub Actions ni pipeline |
| Migraciones | Manual (`ALTER TABLE`), sin historial de versiones |
| Migraciones | Manual (`ALTER TABLE`), sin historial de versiones |

---

## Áreas de alto riesgo al modificar

1. **`backend/models.py` + `_run_migrations()`** — Cambios al schema requieren nueva migración manual. Sin migración, las columnas nuevas no existirán en DBs existentes.
2. **`backend/routers/sales.py::_handle_showcase_stock`** — Lógica de trozado crítica. Cambios sin entender el modelo `entero/trozado` rompen el stock de vitrina.
3. **`backend/auth.py`** — Cambiar el algoritmo de hash o el `PIN_SALT` invalida todos los PINs existentes. El `JWT_SECRET_KEY` se carga desde `.env`; cambiarlo invalida todos los tokens activos.
4. **`backend/seed.py`** — Si la condición "solo seedear si está vacío" falla, duplica datos. Las categorías de gasto se seedean independientemente de los vendedores.
5. **`dist/`** — Nunca editar manualmente. Siempre regenerar con `npm run build`.
6. **`backend/routers/accounting.py::export_report`** — El export usa openpyxl; si la dependencia no está instalada, falla en tiempo de request, no al arrancar.
