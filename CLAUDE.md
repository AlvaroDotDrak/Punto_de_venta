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
| Auth | JWT + bcrypt (passlib) |
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
│   ├── main.py          Lifespan, CORS, include routers, SPA catch-all
│   ├── models.py        Modelos SQLAlchemy (tablas)
│   ├── schemas.py       Pydantic schemas (request/response)
│   ├── database.py      Engine, SessionLocal, Base, get_db
│   ├── auth.py          JWT, get_current_seller, require_admin
│   ├── audit.py         log_action, ACTIONS constants
│   ├── seed.py          seed_database() — datos demo al iniciar
│   ├── backup.py        check_and_run_backup()
│   └── routers/
│       ├── auth.py      POST /api/login, GET /api/me
│       ├── sellers.py   CRUD vendedores
│       ├── products.py  CRUD productos + POST /restock
│       ├── sales.py     CRUD ventas + POST /void
│       ├── showcase.py  CRUD vitrina (showcaseItems)
│       ├── cash.py      Caja registradora (open/close/movements)
│       ├── orders.py    Pedidos/encargos
│       ├── ingredients.py Ingredientes y movimientos
│       ├── audit.py     GET audit log
│       └── config.py    Configuración global
├── src/
│   ├── main.jsx         Entry point (BrowserRouter > ToastProvider > SellerProvider > App)
│   ├── App.jsx          Shell: rutas React Router
│   ├── pages/           Una página = una ruta
│   ├── components/
│   │   ├── Layout/      Sidebar + Header
│   │   └── Ventas/      TypeModal, PaymentModal, ReceiptModal
│   ├── context/         SellerContext + ToastContext
│   └── utils/
│       ├── api.js       fetch wrapper (base URL /api)
│       └── formatters.js formatCurrency, formatDate, getFreshnessStatus
├── inicio.sh            Script de inicio
├── requirements.txt     Dependencias Python
└── dist/                Build de producción (generado por npm run build)
```

### Comunicación frontend → backend

El frontend usa `src/utils/api.js` que hace fetch a `/api/*`. En desarrollo, Vite tiene un proxy configurado hacia `:8000`. En producción, el mismo backend sirve el `dist/` y no hace falta proxy.

---

## Base de datos (SQLite / SQLAlchemy)

### Modelos y campos clave

| Tabla | Campos destacados |
|---|---|
| `sellers` | `pin` (SHA-256 hash), `role` ('admin'\|'seller'), `active` |
| `products` | `category` (vitrina\|salados\|encargo\|bebidas\|cafe), `slices` (trozos/unidad), `max_showcase_hours`, `stock` (Integer nullable — solo bebidas), `photo` (base64) |
| `showcase_items` | `showcase_type` ('entero'\|'trozado'), `status` ('active'\|'sold'\|'removed'\|'sliced'), `parent_id` (trozo → entero original) |
| `sales` | `status` ('completed'\|'voided'), `voided_at`, `void_reason`, `payment_method` |
| `sale_items` | snapshot de nombre/precio, `showcase_type` |
| `orders` | `status` ('pendiente'\|'en_produccion'\|'listo'\|'entregado'), `advance`, `balance` |
| `cash_register` | `status` ('open'\|'closed'), `opening_amount`, `closing_amount`, `expected_amount` |
| `cash_movements` | `type` ('sale'\|'expense'\|'income'\|'void'), `payment_method` |
| `ingredients` | `unit`, `current_stock`, `min_stock`, `last_price` |
| `audit_log` | `action`, `seller_id`, `details` |

### Migraciones

No hay Alembic. Las columnas nuevas se agregan en `backend/main.py::_run_migrations()` como `ALTER TABLE ... ADD COLUMN` dentro de un try/except (falla silenciosamente si ya existe):

```python
def _run_migrations():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE products ADD COLUMN stock INTEGER"))
            conn.commit()
        except Exception:
            pass  # ya existe
```

**Siempre usar `datetime.now()`, nunca `datetime.utcnow()`** — la DB guarda hora local chilena. `utcnow()` causa que los filtros de fecha fallen.

---

## Autenticación y roles

- JWT Bearer token. El frontend lo guarda en `sessionStorage` (se borra al cerrar pestaña).
- El PIN se almacena como hash SHA-256. En el backend, `auth.py` verifica con `hashlib.sha256`.
- Roles: `'admin'` y `'seller'`. Los admins tienen acceso a todas las rutas; los sellers solo a Ventas, Vitrina, Caja y Pedidos.
- Bloqueo de PIN: 3 intentos fallidos → 5 minutos (manejado en `SellerSelect.jsx` con `localStorage`).
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

1. Marcar `sale.status = 'voided'` con razón (mínimo 10 caracteres).
2. Revertir `showcase_items` asociados a `status: 'active'`.
3. Si pago era `efectivo` y hay caja abierta → crear movimiento negativo.
4. Registrar en audit log.

### Backup automático

`check_and_run_backup()` en `backend/backup.py` se ejecuta al iniciar. Genera un archivo JSON descargable si pasaron 24h desde el último backup (clave `lastAutoBackupDate` en el sistema).

---

## Convenciones de código

### Nombrado

- **Archivos de páginas**: PascalCase en español (`HistorialVentas.jsx`, `SellerSelect.jsx`)
- **Componentes**: PascalCase (`ProductInfoTooltip.jsx`)
- **Utilidades**: camelCase (`formatters.js`, `api.js`)
- **Variables/funciones**: camelCase en español (`currentSeller`, `vendedores`, `calcularTotal`)
- **Constantes de acciones audit**: UPPER_SNAKE_CASE en `ACTIONS` object (`backend/audit.py`)

### Estructura para agregar una nueva página

1. Crear `src/pages/NombrePagina.jsx`
2. Agregar ruta en `App.jsx`
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
- `formatDate(date)` → `"Hoy"`, `"Ayer"`, o `"15 ene 2026"`
- `getFreshnessStatus(placedAt, maxHours)` → `'fresh'|'warning'|'danger'`

### Registro de auditoría (backend)

```python
from ..audit import ACTIONS, log_action
log_action(db, ACTIONS.SALE, seller.id, f"Venta ${total:.0f}")
```

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
- `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-sm`
- `modal-overlay`, `modal`, `modal-header`, `modal-body`, `modal-footer`
- `page-header`, `page-title`
- `badge`, `badge-info`, `badge-success`, `badge-danger`

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
| `HistorialVentas.jsx` | Check legacy `currentSeller?.name !== 'Admin'` en vez de `role === 'admin'` |
| `SellerSelect.jsx` | Lockout en `localStorage`; eludible borrando el storage |
| Tests | Solo 1 archivo de tests, cobertura mínima, no prueban la API |
| Sin CI/CD | No hay GitHub Actions ni pipeline |
| `Configuracion.jsx` | Import de JSON no valida estructura |
| Migraciones | Manual (`ALTER TABLE`), sin historial de versiones |

---

## Áreas de alto riesgo al modificar

1. **`backend/models.py` + `_run_migrations()`** — Cambios al schema requieren nueva migración manual. Sin migración, las columnas nuevas no existirán en DBs existentes.
2. **`backend/routers/sales.py::_handle_showcase_stock`** — Lógica de trozado crítica. Cambios sin entender el modelo `entero/trozado` rompen el stock de vitrina.
3. **`backend/auth.py`** — Cambiar el algoritmo de hash invalida todos los PINs existentes.
4. **`backend/seed.py`** — Si la condición "solo seedear si está vacío" falla, duplica datos.
5. **`dist/`** — Nunca editar manualmente. Siempre regenerar con `npm run build`.
