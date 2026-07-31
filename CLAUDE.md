# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Descripción del proyecto

**Punto de Venta multi-rubro** — plataforma POS para negocios chicos chilenos. Nació como POS de
pastelería y evolucionó a una arquitectura de **verticales (rubros)**: cada instalación corre un solo
rubro (pastelería, botillería, cevichería, verdulería, minimarket, restaurant) que define qué módulos
se activan, las categorías de producto/gasto, el branding y la terminología.

Tiene un **backend FastAPI + SQLite** que sirve la API REST, y un **frontend React** compilado a
`dist/` que el propio backend sirve como SPA (también instalable como PWA).

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
| Impresión | ESC/POS raw vía `win32print` (pywin32, opcional — solo Windows) + Pillow para el logo |
| Servidor | Uvicorn |
| Empaquetado | PyInstaller (`run_pos.py` + `build_exe.bat`) para distribuir como .exe |
| Migraciones | Manual (`_add_column_if_missing` en `main.py::_run_migrations`) — no usa Alembic |

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
| PWA | `public/manifest.json` + `public/sw.js` (prompt de instalación en `App.jsx`) |
| Tests | Vitest + @testing-library/react (jsdom) |
| Lint | ESLint v9 flat config |

---

## Cómo iniciar la aplicación

Requiere un `.env` en la raíz (copiar de `.env.example`) con `PIN_SALT` y `JWT_SECRET_KEY`.
Opcional: `POS_DEV_PIN` / `POS_DEV_NAME` para crear la cuenta de soporte (rol `dev`) en el primer arranque.

```bash
bash inicio.sh        # Linux
inicio.bat            # Windows (producción, puerto 8000, browser en kiosko)
inicio_dev.bat        # Windows (DB/puerto de desarrollo: 8001)
python run_pos.py     # Entry point del ejecutable PyInstaller (genera .env solo)
```

`inicio.sh`:
1. Crea `.venv` si no existe e instala `requirements.txt`
2. Activa el entorno virtual
3. Lanza `uvicorn backend.main:app --host 0.0.0.0 --port 8000`
4. Abre el browser en `http://localhost:8000` (si hay GUI)

La app completa (API + frontend) queda en **http://localhost:8000**.

Con una DB fresca, la app muestra el **SetupWizard**: elige rubro, nombre del negocio, paleta y PIN
del admin (`POST /api/setup`, un solo uso). No se seedean vendedores fuera del wizard.

### Desarrollo frontend

```bash
npm run dev      # Dev server en http://localhost:5173 (proxy → :8000)
npm run build    # Compila React → dist/ (necesario para producción)
npm run test     # Vitest
npx eslint src/
```

> **Importante**: tras cada cambio en el frontend, ejecutar `npm run build` para que el backend sirva
> la versión actualizada. `index.html` y `sw.js` se sirven con `Cache-Control: no-cache`, así el
> reload normal toma el build nuevo (los assets van con hash).

---

## Arquitectura

### Flujo general

```
Browser
  ↕ HTTP (fetch via src/utils/api.js)
FastAPI (puerto 8000)
  ├─ /api/*  → Routers de la API
  └─ /*      → Sirve dist/index.html (SPA catch-all, con guard anti path-traversal)
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
│   ├── auth.py          JWT, hash_pin, get_current_seller, require_admin, require_dev,
│   │                    require_product_access, require_permission (permisos granulares)
│   ├── audit.py         log_action, ACTIONS constants
│   ├── seed.py          seed_database() (arranque) + seed_vertical() (setup) + seed_dev_account()
│   ├── backup.py        check_and_run_backup, run_manual_backup, restore_from_backup
│   ├── verticals.py     Presets de rubro: capabilities, categorías, paletas, terminología (datos puros)
│   ├── utils.py         convert_unit, compute_cost_per_unit, calculate_vat, y más
│   └── routers/
│       ├── auth.py          POST /api/login, GET /api/me
│       ├── sellers.py       CRUD vendedores
│       ├── products.py      CRUD productos + POST /restock + GET /{id}/stats
│       │                    + GET /lookup/{barcode} (DB local → Open Food Facts, para carga rápida)
│       ├── sales.py         CRUD ventas + POST /void (precio recalculado en servidor)
│       ├── showcase.py      CRUD vitrina (showcaseItems)
│       ├── cash.py          Caja registradora (open/close/movements, trazabilidad opened_by/closed_by)
│       ├── orders.py        Pedidos/encargos
│       ├── ingredients.py   Ingredientes y movimientos
│       ├── recipes.py       Recetas por producto (costeo de insumos)
│       ├── audit.py         GET audit log
│       ├── config.py        Perfil de rubro (/config/profile), /setup, backup manual/restore, key-value
│       ├── expenses.py      CRUD gastos + CRUD categorías de gasto
│       ├── suppliers.py     CRUD proveedores
│       ├── purchases.py     Compras con detalle por línea (facturas de proveedor)
│       ├── invoices.py      CRUD facturas emitidas (boletas empresa)
│       ├── accounting.py    GET /summary + GET /export (Excel)
│       └── printing.py      Impresión térmica ESC/POS de boletas (solo Windows; 503 si no hay pywin32)
├── src/
│   ├── main.jsx         Entry point (BrowserRouter > providers > App)
│   ├── App.jsx          Shell: rutas + guards (AdminRoute, PermissionRoute, CapabilityRoute),
│   │                    SetupWizard si falta setup, banner de servidor caído, prompt PWA
│   ├── pages/
│   │   ├── SetupWizard.jsx       Configuración inicial (rubro, branding, PIN admin)
│   │   ├── SellerSelect.jsx      Selección de usuario con PIN
│   │   ├── Ventas.jsx            Punto de venta (POS: showcase, peso, barcode según capabilities)
│   │   ├── Vitrina.jsx           Control de frescura de vitrina (capability showcase)
│   │   ├── Visicooler.jsx        Stock físico de unidades/kg (capability cooler_stock)
│   │   ├── Pedidos.jsx           Pedidos por encargo (capability orders)
│   │   ├── Productos.jsx         Catálogo CRUD + estadísticas + recetas
│   │   ├── CargaRapida.jsx       Ingreso masivo en loop: escanear → autocompletar → precio → Enter
│   │   ├── Insumos.jsx           Ingredientes y movimientos (capability recipes)
│   │   ├── Caja.jsx              Apertura/cierre de caja y movimientos
│   │   ├── Dashboard.jsx         Métricas y gráficos (admin)
│   │   ├── HistorialVentas.jsx   Historial con anulación
│   │   ├── Vendedores.jsx        CRUD vendedores + permisos granulares + presets de rol (admin)
│   │   ├── Configuracion.jsx     Ajustes, branding, paleta, backup/restore, impresión (admin)
│   │   ├── Gastos.jsx            Registro de gastos operativos
│   │   ├── Compras.jsx           Facturas de compra con líneas (repone stock/insumos) (admin)
│   │   ├── Contabilidad.jsx      Resumen contable + export Excel (admin)
│   │   └── Facturas.jsx          Registro de facturas a empresas (admin)
│   ├── components/
│   │   ├── Layout/               Sidebar (gating por capability/permiso/rol + terminología) + Header
│   │   ├── Ventas/               TypeModal, PaymentModal, ReceiptModal
│   │   ├── Vitrina/              AddModal, DetailModal, ExtendModal, RemoveModal, SliceModal
│   │   ├── Productos/            RecipeModal
│   │   ├── Compras/              ItemPicker, QuickCreateItemModal
│   │   ├── Gastos/               CategoryManagerModal, SupplierManagerModal
│   │   └── ProductStatsModal.jsx, RestockPanel.jsx, DateInput.jsx, ...
│   ├── context/                  SellerContext + ToastContext + ConfigContext (perfil de rubro)
│   └── utils/
│       ├── api.js                fetch wrapper (base URL /api, Bearer token, emite evento server-status)
│       ├── formatters.js         formatCurrency, formatDate, getFreshnessStatus, y más
│       └── verticals.js          Espejo liviano de los rubros (VERTICAL_OPTIONS, DEFAULT_PROFILE)
├── inicio.sh / inicio.bat / inicio_dev.bat
├── run_pos.py           Entry point PyInstaller (genera secretos, browser kiosko, uvicorn)
├── build_exe.bat        Empaqueta el .exe con PyInstaller
├── requirements.txt     Dependencias Python (versiones fijadas)
└── dist/                Build de producción (generado por npm run build)
```

### Comunicación frontend → backend

El frontend usa `src/utils/api.js` que hace fetch a `/api/*` con el JWT Bearer token del
`sessionStorage`. En desarrollo, Vite tiene un proxy configurado hacia `:8000`. En producción, el
mismo backend sirve el `dist/` y no hace falta proxy.

---

## Sistema multi-rubro (verticales)

**La fuente de verdad es `backend/verticals.py`** (datos puros, sin DB). Cada rubro define:

- **capabilities**: interruptores de módulos — `showcase`, `freshness`, `orders`, `cooler_stock`,
  `recipes`, `tables` (pendiente), `weight_sale`, `barcode`, `age_restriction`.
- **product_categories**: con flags `showcase` (entra a la lógica entero/trozado), `sliceable`,
  `stock` (tracking físico) y `age_restricted` (alerta de venta de alcohol).
- **expense_categories**, **branding** por defecto, **paletas** curadas y **terminología**
  (ej. "Visicooler" → "Inventario", "Pedidos" → "Comandas").

Flujo de configuración:

1. `GET /api/config/profile` (público, se necesita antes del login) devuelve el bundle resuelto:
   preset del rubro + overrides de la instancia guardados en `system_config` (JSON strings).
   Resuelto en `config.py::build_profile()`.
2. `ConfigContext.jsx` consume el perfil y expone `hasCapability(cap)`, `t(termKey, fallback)`,
   `branding`, `categories`, `colors` — y aplica la paleta como CSS custom properties al documento.
3. Gating: `CapabilityRoute` en `App.jsx`, ítems del Sidebar con `capability:`/`termKey:`, y
   condicionales dentro de las páginas.

**Overrides**: el admin puede cambiar paleta, branding, categorías y tax_rate vía
`PUT /api/config/profile`. Las **capabilities solo las modifica la cuenta `dev`** (si un admin manda
ese campo se ignora silenciosamente).

Una DB legacy ya poblada (tiene vendedores) se auto-marca `business_type=pasteleria` +
`setup_complete=true` en `_run_migrations()` para no mostrar el wizard.

---

## Base de datos (SQLite / SQLAlchemy)

### Modelos y campos clave

| Tabla | Campos destacados |
|---|---|
| `sellers` | `pin` (SHA-256 hash), `role` ('admin'\|'seller'\|'dev'), `active`, `failed_attempts`, `locked_until`, permisos granulares: `products_access` ('none'\|'view'\|'full'), `can_access_insumos`, `can_access_historial`, `can_void_sales`, `can_close_cash`, `can_cash_movements`, `can_view_costs` |
| `products` | `category` (según rubro), `slices`, `slice_price`, `cost_price`, `sold_by` ('unit'\|'weight' — si weight, `price` = precio por kg), `stock` (Float nullable — unidades o kg; null = sin tracking), `min_stock_cooler`, `barcode`, `max_showcase_hours`, `photo` (base64) |
| `showcase_items` | `showcase_type` ('entero'\|'trozado'), `status` ('active'\|'sold'\|'removed'\|'sliced'), `parent_id` (trozo → entero original) |
| `sales` | `status` ('completed'\|'voided'), `voided_at`, `void_reason`, `payment_method`, `has_receipt` |
| `sale_items` | snapshot de nombre/precio, `showcase_type`, `weight` (kg vendidos si sold_by='weight') |
| `orders` | `status` ('pendiente'\|'en_produccion'\|'listo'\|'entregado'), `advance`, `balance` |
| `cash_register` | `status` ('open'\|'closed'), `opening_amount`, `closing_amount`, `expected_amount`, `notes`, `opened_by`, `closed_by` (snapshots del nombre) |
| `cash_movements` | `type` ('sale'\|'expense'\|'income'\|'void'), `payment_method`, `seller_id` (FK nullable) |
| `ingredients` | `unit`, `current_stock`, `min_stock`, `last_price` |
| `ingredient_movements` | `type` ('purchase'\|'adjustment'\|'usage'), `sale_id`/`product_id` (para revertir al anular y rentabilidad), `notes` |
| `product_recipes` | `product_id`+`ingredient_id` (unique), `quantity` (por lote), `yield_qty` (unidades que rinde) |
| `expense_categories` | `name`, `description`, `active` |
| `expenses` | `category_id`, `amount`, `receipt_photo` (base64), `document_type` ('boleta'\|'factura'), `payment_method`, `seller_id`, `supplier_id` (FK nullable) |
| `suppliers` | `name`, `rut`, `phone`, `email`, `notes`, `active` |
| `purchase_items` | líneas de una factura de compra, cuelgan de un `Expense`; `product_id`/`ingredient_id`/`category_id` opcionales; `unit_cost` y `line_total` en **NETO** (sin IVA — el IVA es crédito fiscal, no costo) |
| `invoices` | `invoice_number` (único), `rut`, `business_name`, `net_amount`, `tax_amount`, `total_amount`, `sale_id` (FK nullable) |
| `audit_log` | `action`, `seller_id`, `details` |
| `system_config` | key/value; guarda `business_type`, `setup_complete`, `palette`, `branding` (JSON), `capabilities` (JSON), `product_categories` (JSON), `tax_rate`, config de impresión, etc. |

### Migraciones

No hay Alembic. Las columnas nuevas se agregan en `backend/main.py::_run_migrations()` **solo** con
el helper `_add_column_if_missing(conn, sql)` (ignora únicamente "duplicate column name"; cualquier
otro error es crítico y se propaga). Las tablas nuevas se crean vía `Base.metadata.create_all()` al
arrancar. También se crean índices `CREATE INDEX IF NOT EXISTS` para las consultas frecuentes.

```python
_add_column_if_missing(conn, "ALTER TABLE products ADD COLUMN stock INTEGER")
```

Historial resumido (ver `_run_migrations()` para la lista exacta): v2.1–v2.3 stock/slice_price,
v2.4 caja notes/seller_id, v2.5 has_receipt, v2.6 lockout de PIN, v2.7 document_type en gastos,
v2.8–v2.10 trazabilidad de ingredient_movements, v2.11 cost_price, v2.12 permisos granulares +
can_void/can_close/can_cash_movements/can_view_costs, v2.13 marca de rubro (business_type),
v2.14–v2.15 venta por peso, v2.16 barcode, v2.17–v2.19 compras (supplier_id, payment_method,
category_id por línea), v2.20 opened_by/closed_by en caja.

**Siempre usar `datetime.now()`, nunca `datetime.utcnow()`** — la DB guarda hora local chilena.
`utcnow()` causa que los filtros de fecha fallen y que los JWT expiren 3-4h antes de lo esperado.

---

## Autenticación, roles y permisos

- JWT Bearer token. El frontend lo guarda en `sessionStorage` (se borra al cerrar pestaña).
- El PIN se almacena como SHA-256 con salt fijo (`PIN_SALT` de `.env`).
- Bloqueo de PIN: 3 intentos fallidos → 5 minutos, **persistido en SQLite** (`sellers.failed_attempts`,
  `sellers.locked_until`). Sobrevive reinicios. El frontend refleja el estado pero no es la fuente de verdad.

### Roles

- **`dev`** — cuenta de soporte del proveedor (superadmin). Se crea en el primer arranque si existe
  `POS_DEV_PIN` en el entorno (`seed.py::seed_dev_account`). Cumple todo lo de admin y además es el
  único que puede modificar capabilities.
- **`admin`** — acceso a todo el negocio: Dashboard, Compras, Contabilidad, Facturas, Vendedores,
  Configuración, etc.
- **`seller`** — Ventas, Vitrina, Visicooler, Caja, Pedidos, Gastos (solo ve los de hoy). El resto
  depende de sus permisos granulares.

### Permisos granulares de sellers

Columnas booleanas en `sellers` + `products_access` ('none'/'view'/'full'):

| Permiso | Controla |
|---|---|
| `products_access` | Página Productos (view = solo lectura, full = CRUD) |
| `can_access_insumos` | Página Insumos |
| `can_access_historial` | Página Historial de Ventas |
| `can_void_sales` | Anular ventas |
| `can_close_cash` | Cerrar la caja (abrirla puede cualquiera) |
| `can_cash_movements` | Ingresos/retiros manuales de caja |
| `can_view_costs` | Ver precio de costo y márgenes (si no, el backend manda `cost_price`/`cost_per_unit` en null) |

Dependencias FastAPI en `backend/auth.py`: `get_current_seller`, `require_admin` (acepta admin y dev),
`require_dev`, `require_product_access(write=bool)`, y el genérico **`require_permission(perm)`**
(deja pasar admin/dev, o al seller con esa columna en True). Guards del frontend en `App.jsx`:
`AdminRoute`, `PermissionRoute`, `CapabilityRoute`. `Vendedores.jsx` trae presets de rol
(Cajero/Encargado/Bodeguero) que aplican sets de permisos al form.

---

## Lógica de negocio crítica

### Categorías de productos

Definidas por el rubro (ver `verticals.py`). En pastelería:

```
vitrina   → tortas y pasteles (venta por entero o trozo — flag showcase+sliceable)
salados   → empanadas, sándwiches (showcase, sin trozar)
encargo   → tortas de encargo (no aparecen en vitrina ni en POS showcase)
bebidas   → visicooler — stock físico numérico
cafe      → café de máquina — sin tracking de stock
mostrador → galletas y otros con stock físico
```

Otros rubros usan sus propias categorías (cervezas, ceviches, frutas...). La lógica genérica se
apoya en los flags de la categoría (`showcase`, `stock`, `age_restricted`), no en nombres hardcodeados.

### Stock de vitrina (showcase items)

La lógica más compleja. Al vender "1 trozo" en el backend (`sales.py::_handle_showcase_stock`):

1. Buscar `showcaseItem` con `{ product_id, status: 'active', showcase_type: 'trozado' }`.
2. Si existe → marcar `status: 'sold'`.
3. Si **no** existe → buscar un `entero` activo:
   - Marcar entero como `status: 'sliced'`
   - Crear `(product.slices - 1)` nuevos registros `trozado` con `parent_id`
   - El trozo vendido va directo como `status: 'sold'`

Al vender un "entero": buscar `{ showcase_type: 'entero', status: 'active' }` y marcarlo `sold`.

### Stock físico (visicooler / inventario)

- `product.stock` es `Float` nullable. `null` = sin tracking. Número = unidades (o kg si
  `sold_by='weight'`) disponibles.
- Al vender, el stock se decrementa; si es insuficiente → HTTP 400.
- Reponer: `POST /api/products/{id}/restock` (solo admin) o vía una compra con líneas.
- Productos con `stock == 0` aparecen deshabilitados en el POS ("Sin stock").

### Venta por peso y código de barras (retail)

- `sold_by='weight'`: `price` es precio por kg; el item de venta lleva `weight` y el precio
  autoritativo se recalcula en el servidor (`_authoritative_unit_price`). El consumo de stock
  es `weight * quantity` en kg.
- `barcode` (capability): búsqueda por código de barras en el POS; índice en `products.barcode`.
- `age_restriction` (capability): las categorías con `age_restricted` disparan alerta de venta
  de alcohol en el POS.

### Precios: el servidor manda

`sales.py` recalcula el precio unitario y el total en el servidor a partir del producto (entero,
trozo, o peso). Los precios enviados por el cliente no se confían.

### Caja / movimientos de efectivo

- La caja debe estar **abierta** para registrar ventas. Abrir puede cualquier vendedor autenticado;
  **cerrar requiere `can_close_cash`** y los movimientos manuales `can_cash_movements`.
- `opened_by`/`closed_by` guardan el nombre del vendedor (snapshot).
- Solo el método `efectivo` suma al `expected_amount` al cierre.
- Al anular una venta en efectivo, se crea un `CashMovement` con `amount` negativo (`type: 'void'`).

### Anulación de ventas (void)

1. Marcar `sale.status = 'voided'` con razón (mínimo 10 caracteres). Requiere `can_void_sales` (o admin).
2. Revertir `showcase_items` asociados a `status: 'active'` y devolver stock/insumos consumidos.
3. Si pago era `efectivo` y hay caja abierta → crear movimiento negativo.
4. Registrar en audit log.

### Boleta (`has_receipt`) e impresión térmica

- `sale.has_receipt` se fuerza a `True` cuando el pago es `tarjeta` (Mercado Pago emite boleta
  automáticamente). Para efectivo y transferencia, el vendedor elige en `PaymentModal`.
- Contabilidad usa este campo para boletas emitidas vs. sin boleta.
- **Impresión**: `backend/routers/printing.py` genera ESC/POS (80mm, CP850 — cancela el modo de
  caracteres chinos de las POS-80 clónicas) y lo manda raw al spooler de Windows vía pywin32.
  En Linux o sin pywin32 devuelve 503 sin tumbar la app. Config en `system_config`
  (`printer_name`, `auto_print`, `print_logo`, pie de boleta multilínea).

### Gastos operativos

- Los gastos se clasifican por `ExpenseCategory`. Las categorías se siembran **por rubro** y de forma
  idempotente (compara por nombre contra toda la tabla, no resucita desactivadas).
- Cualquier vendedor puede registrar un gasto. Solo admin puede editarlos, eliminarlos o verlos fuera
  del día actual. Comprobante como base64 en `expense.receipt_photo`.

### Compras / Proveedores (admin)

- Una compra es un `Expense` con `purchase_items` (líneas). Cada línea puede reponer un producto,
  un ingrediente, o ser solo gasto; puede llevar su propia categoría (factura mixta) o heredar la
  del encabezado.
- `unit_cost`/`line_total` se guardan en **neto**: el IVA de una factura es crédito fiscal, no costo.
  Hay opción "precios ya incluyen IVA" para no inflar el total.
- Reponer vía compra actualiza stock del producto / `current_stock` + `last_price` del ingrediente.

### Facturas a empresas

- `invoice_number` es único — HTTP 409 si se intenta duplicar.
- El IVA (19%) se calcula automáticamente si no se especifica `tax_amount`.
- Una factura puede vincularse opcionalmente a una `sale_id`.

### Módulo de Contabilidad

- `GET /api/accounting/summary?date_from=...&date_to=...` → resumen de ingresos, gastos, facturas
  y boletas del rango.
- `GET /api/accounting/export?...` → Excel (openpyxl) con hojas Resumen, Detalle Ventas (solo
  `status='completed'`), Detalle Gastos. Solo admin.

### Backup y restore

- `check_and_run_backup()` corre al iniciar: genera un JSON si pasaron 24h desde el último
  (rotación de archivos antiguos). Backup manual: `POST /api/backup/manual` (admin).
- **Restore**: `POST /api/backup/restore?confirm=true` (admin) reemplaza TODOS los datos por los del
  JSON. Internamente hace `engine.dispose()` — el endpoint abre una sesión nueva para el audit log
  porque la del request queda inválida.

---

## Convenciones de código

### Nombrado

- **Archivos de páginas**: PascalCase en español (`HistorialVentas.jsx`, `SellerSelect.jsx`)
- **Componentes**: PascalCase, agrupados por página en `src/components/<Página>/`
- **Utilidades**: camelCase (`formatters.js`, `api.js`)
- **Variables/funciones**: camelCase en español (`currentSeller`, `vendedores`, `calcularTotal`)
- **Constantes de acciones audit**: UPPER_SNAKE_CASE en `ACTIONS` object (`backend/audit.py`)

### Estructura para agregar una nueva página

1. Crear `src/pages/NombrePagina.jsx`
2. Agregar ruta en `App.jsx` (usar `<AdminRoute>`, `<PermissionRoute>` o `<CapabilityRoute>` según aplique)
3. Agregar ítem en `src/components/Layout/Sidebar.jsx` (con `adminOnly`, `permission`, `capability`
   y/o `termKey` si aplica)

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

Para textos adaptados al rubro, usar `t()` de `useConfig()`: `t('cooler', 'Visicooler')`.

### Registro de auditoría (backend)

```python
from ..audit import ACTIONS, log_action
log_action(db, ACTIONS.SALE, seller.id, f"Venta ${total:.0f}")
```

Constantes disponibles en `ACTIONS`: `LOGIN`, `LOGOUT`, `SALE`, `VOID_SALE`, `CASH_OPEN`,
`CASH_CLOSE`, `CASH_MOVEMENT`, `PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_DELETE`,
`RECIPE_UPDATE`, `SHOWCASE_ADD`, `SHOWCASE_REMOVE`, `SHOWCASE_EXTEND`, `SHOWCASE_SLICE`,
`ORDER_CREATE`, `ORDER_UPDATE`, `SELLER_CREATE`, `SELLER_UPDATE`, `INGREDIENT_CREATE`,
`INGREDIENT_MOVEMENT`, `BACKUP`, `RESTORE`, `IMPORT_DATA`, `EXPENSE_CREATED`, `EXPENSE_UPDATED`,
`EXPENSE_DELETED`, `EXPENSE_CATEGORY_CREATED`, `EXPENSE_CATEGORY_UPDATED`, `SUPPLIER_CREATED`,
`SUPPLIER_UPDATED`, `PURCHASE_CREATED`, `INVOICE_CREATED`, `ACCOUNTING_EXPORT`.

Agregar nuevas constantes al objeto `ACTIONS` en `backend/audit.py`.

---

## CSS / Diseño

El sistema usa custom properties definidas en `src/index.css`:

```css
--color-primary: #BF5A2F   /* naranja tostado (default pastelería) */
--color-bg: #F5EFE6         /* crema */
--color-bg-sidebar: #120A04 /* casi negro */
--font-body: "Plus Jakarta Sans"
--font-heading: "Fraunces"
```

**La paleta activa la aplica `ConfigContext` en runtime** (sobrescribe `--color-primary` y variantes
según la paleta del rubro elegida en Configuración). Las paletas viven en `verticals.py` (backend) y
`src/utils/verticals.js` (espejo).

Clases de utilidad clave:
- `vt-*` → componentes de la página Vitrina (vt-card, vt-badge, vt-progress-*, etc.)
- `pos-*` → componentes del POS (pos-layout, pos-product-btn, pos-cart-*, etc.)
- `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-sm`, `btn-danger`
- `modal-overlay`, `modal`, `modal-header`, `modal-body`, `modal-footer`
- `page-header`, `page-title`
- `badge`, `badge-info`, `badge-success`, `badge-danger`
- `card`, `form-group`, `form-label`, `form-input`, `form-select`

Los modales usan `align-items: flex-start` + `overflow-y: auto` en el overlay para que funcionen
correctamente con contenido largo.

---

## Tests

- **Frontend** (`tests/*.test.jsx|js`, Vitest + jsdom): `StockLogic`, `VoidAndCash` (legacy, simulan
  la lógica con un mock Dexie), `RecipeModal`, `RestockPanel`, `formatters`, `verticals`.
  Correr: `npx vitest run`.
- **Backend** (`tests/test_*.py`, pytest): `test_utils.py`, `test_verticals.py` — lógica pura, sin DB.
  Correr: `python -m pytest tests/ -q` (requiere pytest instalado en el venv).
- ⚠️ La suite de Vitest requiere **Node ≥ 20.17** (jsdom arrastra una dependencia ESM que Node 18
  no puede `require()`). Con Node 18 los tests fallan al arrancar el worker.
- Nada prueba la API FastAPI de punta a punta todavía.

---

## Deuda técnica conocida

| Área | Problema |
|---|---|
| Tests | Cobertura mínima; no prueban la API FastAPI; los de stock son legacy con mock Dexie |
| Sin CI/CD | No hay GitHub Actions ni pipeline |
| Migraciones | Manual (`ALTER TABLE`), sin historial de versiones ni rollback |
| PINs | SHA-256 + salt fijo (débil para secretos de 4-6 dígitos); mitigado por lockout |
| Fotos | Base64 dentro de SQLite (products.photo, expenses.receipt_photo) infla la DB y los backups |

---

## Áreas de alto riesgo al modificar

1. **`backend/models.py` + `_run_migrations()`** — Cambios al schema requieren nueva migración con
   `_add_column_if_missing`. Sin migración, las columnas nuevas no existirán en DBs existentes.
2. **`backend/routers/sales.py::_handle_showcase_stock`** — Lógica de trozado crítica. Cambios sin
   entender el modelo `entero/trozado` rompen el stock de vitrina. Lo mismo aplica al recálculo de
   precios en el servidor (`_authoritative_unit_price`).
3. **`backend/auth.py`** — Cambiar el algoritmo de hash o `PIN_SALT` invalida todos los PINs.
   Cambiar `JWT_SECRET_KEY` invalida los tokens activos. `require_admin` debe seguir aceptando `dev`.
4. **`backend/verticals.py` + `config.py::build_profile`** — Renombrar una capability o categoría
   rompe los overrides guardados en `system_config` de instalaciones existentes. Los presets son la
   fuente de verdad; `src/utils/verticals.js` es solo un espejo para el wizard/fallback.
5. **`backend/seed.py`** — El seed de arranque NO debe crear vendedores (eso es del SetupWizard).
   `_seed_expense_categories` debe seguir siendo idempotente por nombre.
6. **`backend/backup.py::restore_from_backup`** — Hace `engine.dispose()`; cualquier código posterior
   al restore debe abrir una sesión nueva.
7. **`backend/routers/printing.py`** — Los comandos ESC/POS (CP850, cancelar modo kanji) están
   calibrados para POS-80 clónicas; cambiarlos rompe acentos o el layout de la boleta.
8. **`dist/`** — Nunca editar manualmente. Siempre regenerar con `npm run build`.
9. **`backend/routers/accounting.py::export_report`** — openpyxl falla en tiempo de request si no
   está instalado, no al arrancar.

---

## Flujo de trabajo con el agente becario (agy)

Este proyecto usa un flujo de dos agentes: **Claude Code** (arquitecto/revisor) y **agy** (ejecutor).

### Reglas para agy

- **Leer al inicio de cada sesión:** solo `CLAUDE.md` (este archivo) y `task.md` (tarea actual). Nada más.
- **No crear archivos de memoria:** no crear ni modificar archivos en `memory/`, ni `MEMORY.md`, ni `dev-state.json`, ni archivos de log diario. Claude Code maneja la continuidad entre sesiones.
- **No hacer commit nunca.** Implementar, correr `npm run build` si hay cambios de frontend, verificar, y reportar. Claude Code revisa y hace el commit.
- **Trabajar en `master` directamente.** No crear feature branches.
- **No escribir tests** salvo que `task.md` lo indique explícitamente.
- **No agregar comentarios** al código salvo que el WHY sea no obvio.
- **Seguir las convenciones** de nomenclatura y estructura definidas en este archivo.

### Flujo típico

1. Álvaro le pasa una tarea a agy vía `task.md`
2. agy implementa y reporta
3. Claude Code revisa el código
4. Si está correcto, Claude Code hace commit y push
5. Si hay correcciones, Claude Code las hace directamente o escribe una nueva `task.md`
