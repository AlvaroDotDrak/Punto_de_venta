# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Descripción del proyecto

**Punto de Venta – Pastelería** es una aplicación POS (Point of Sale) completamente offline para una panadería/pastelería. No hay backend ni servidor: **todos los datos viven en el navegador** via IndexedDB (Dexie.js). Es una SPA React con rutas del lado del cliente.

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| UI | React 18 + JSX (sin TypeScript) |
| Routing | React Router v6 |
| Base de datos | IndexedDB via Dexie.js v4 |
| Reactividad DB | dexie-react-hooks (`useLiveQuery`) |
| Gráficos | Chart.js 4 + react-chartjs-2 |
| Fechas | date-fns v4 (locale es-CL) |
| Iconos | lucide-react |
| Exportación | xlsx (Excel), JSON nativo |
| Crypto | Web Crypto API nativa del browser |
| Build | Vite 6 |
| Tests | Vitest + @testing-library/react + fake-indexeddb |
| Lint | ESLint v9 flat config |

---

## Comandos de desarrollo

```bash
npm install          # Instalar dependencias
npm run dev          # Dev server en http://localhost:5173 (expuesto en red local)
npm run build        # Build de producción → dist/
npm run preview      # Previsualizar build de producción
npm run test         # Correr todos los tests (Vitest)
```

Correr un único archivo de tests:
```bash
npx vitest tests/StockLogic.test.jsx
```

Correr tests en modo watch:
```bash
npx vitest --watch
```

Lint (no hay script definido, correr directamente):
```bash
npx eslint src/
```

---

## Arquitectura

### Flujo de datos

```
IndexedDB (Dexie)
    ↕ useLiveQuery / await db.table.*
React Components (pages + components)
    ↕ useContext
SellerContext (auth)  +  ToastContext (notificaciones)
```

No hay Redux, Zustand ni ningún gestor de estado global adicional. El estado es local (`useState`) en cada página, excepto auth y toasts que son contextos.

### Árbol de módulos

```
src/
├── main.jsx            Entry point. Proveedores en orden: BrowserRouter > ToastProvider > SellerProvider > App
├── App.jsx             Shell: inicializa DB, ejecuta migraciones, define rutas
├── db.js               *** ÚNICO punto de definición del schema de base de datos ***
├── pages/              Una página = una ruta
├── components/Layout/  Sidebar + Header (se renderizan siempre si hay seller logueado)
├── components/         Componentes reutilizables
├── context/            SellerContext + ToastContext
└── utils/              Lógica pura sin UI
```

### Inicialización de la app (App.jsx)

Al montar, `App.jsx` ejecuta en secuencia:
1. `seedDatabase()` – puebla la DB si está vacía (productos y vendedores de demo)
2. `fixRoles()` – migración única que asigna roles a vendedores pre-v5
3. `checkAndRunBackup()` – backup automático si pasaron 24h

---

## Base de datos (src/db.js)

### Regla crítica de versionado

**NUNCA modificar versiones existentes.** Siempre agregar un nuevo bloque `db.version(N+1)`. Dexie usa las versiones para migraciones automáticas; modificar una versión existente corrompe bases de datos ya instaladas.

```js
// ✅ CORRECTO — agregar nueva versión
db.version(7).stores({ ...schemaActual, nuevaTabla: '++id, campo1, campo2' });

// ❌ INCORRECTO — nunca tocar versiones previas
db.version(6).stores({ ... }); // NO modificar
```

### Tablas y campos relevantes

| Tabla | Campos clave |
|---|---|
| `products` | `slices` (trozos por unidad), `category` (vitrina\|salados\|encargo), `maxShowcaseHours`, `photo` (base64) |
| `showcaseItems` | `showcaseType` (entero\|trozado), `status` (active\|sold\|removed\|sliced), `parentId` (trozo → entero original) |
| `sales` | `status` (completed\|voided), `voidedAt`, `voidReason` |
| `sellers` | `pin` (SHA-256 hash), `role` (admin\|seller) |
| `cashMovements` | `type` (sale\|expense\|income), `paymentMethod` |
| `auditLog` | `action` (constante de `ACTIONS`), `userId`, `details` |

---

## Autenticación y roles

- La sesión se guarda en `sessionStorage` (se borra al cerrar la pestaña).
- El PIN se almacena como hash SHA-256 con salt fijo (`_pasteleria_salt_2026`).
- Roles: `'admin'` y `'seller'`. Los admins ven todas las rutas; los sellers solo ven Ventas, Vitrina, Caja y Pedidos.
- La verificación de rol en el Sidebar usa `currentSeller?.role === 'admin'`.
- **Gotcha**: `HistorialVentas.jsx` usa un check legacy `currentSeller?.name !== 'Admin'` en lugar del rol. Al modificar esa página, migrar al check de rol.
- Bloqueo de PIN: 3 intentos fallidos → 5 minutos de bloqueo (manejado en `SellerSelect.jsx` con `localStorage`).

---

## Lógica de negocio crítica

### Stock de vitrina (showcaseItems)

Esta es la lógica más compleja del sistema. Al vender "1 trozo":

1. Buscar un `showcaseItem` con `{ productId, status: 'active', showcaseType: 'trozado' }`.
2. Si existe → marcar `status: 'sold'`, registrar `saleId`.
3. Si **no** existe → buscar un `entero` activo:
   - Marcar el entero como `status: 'sliced'`
   - Crear `(product.slices - 1)` nuevos registros `trozado` con `parentId: whole.id`
   - El trozo vendido va como `status: 'sold'`

Al vender un "entero":
- Buscar `{ showcaseType: 'entero', status: 'active' }` y marcarlo `sold`.

Esta lógica vive en `src/pages/Ventas.jsx`. No está extraída a un util — si se agrega lógica relacionada, considerar extraerla.

### Caja / movimientos de efectivo

- La caja debe estar **abierta** para registrar movimientos de venta.
- Solo el método `efectivo` suma al `expectedAmount` al cierre.
- Al anular una venta en efectivo, se crea un `cashMovement` con `amount` negativo.
- Al cerrar caja, el sistema calcula `expectedAmount` sumando apertura + entradas - salidas de efectivo.

### Anulación de ventas (void)

1. Marcar `sale.status = 'voided'` con razón (mínimo 10 caracteres).
2. Revertir `showcaseItems` asociados a `status: 'active'`.
3. Si el método de pago era `efectivo` y hay caja abierta, crear movimiento negativo.
4. Registrar en audit log (`ACTIONS.VOID_SALE`).

### Backup automático

`checkAndRunBackup()` dispara un download JSON de todas las tablas si pasaron 24h desde el último backup (clave `lastAutoBackupDate` en `localStorage`). Se ejecuta al iniciar la app. No bloquea el flujo.

---

## Convenciones de código

### Nombrado

- **Archivos de páginas**: PascalCase en español (`HistorialVentas.jsx`, `SellerSelect.jsx`)
- **Componentes**: PascalCase (`ProductInfoTooltip.jsx`)
- **Utilidades**: camelCase (`formatters.js`, `auditLog.js`)
- **Variables/funciones**: camelCase en español (e.g., `currentSeller`, `vendedores`, `calcularTotal`)
- **Constantes de acciones**: UPPER_SNAKE_CASE en `ACTIONS` object

### Estructura para agregar una nueva página

1. Crear `src/pages/NombrePagina.jsx`
2. Agregar ruta en `App.jsx` (`<Route path="/ruta" element={<NombrePagina />} />`)
3. Agregar ítem en el array `navItems` de `src/components/Layout/Sidebar.jsx` (con `adminOnly: true` si aplica)

### Manejo de errores

Patrón estándar en toda la app:

```jsx
try {
  await db.tabla.operacion(datos);
  showToast('Mensaje de éxito', 'success');
} catch (err) {
  console.error('Contexto de error:', err);
  showToast('Mensaje de error para el usuario', 'error');
}
```

- Siempre usar `showToast` del contexto (`useToast()`) para feedback al usuario.
- `auditLog.js` falla silenciosamente (solo `console.warn`) para no interrumpir el flujo.

### Consultas a la base de datos

```jsx
// Datos reactivos (se actualizan automáticamente)
const productos = useLiveQuery(() => db.products.where({ active: true }).toArray());

// Datos one-shot (en handlers o useEffect)
const venta = await db.sales.get(id);
const items = await db.saleItems.where({ saleId: id }).toArray();
```

### Registro de auditoría

Siempre registrar acciones sensibles:

```js
import { logAction, ACTIONS } from '../utils/auditLog';
await logAction(ACTIONS.SALE, currentSeller.id, `Venta $${total}`);
```

Agregar nuevas constantes al objeto `ACTIONS` en `src/utils/auditLog.js` antes de usarlas.

### Formateo de datos

Usar siempre los helpers de `src/utils/formatters.js`:
- `formatCurrency(amount)` → `"$1.500"` (CLP, sin decimales)
- `formatDate(date)` → `"Hoy"`, `"Ayer"`, o `"15 ene 2026"`
- `getFreshnessStatus(placedAt, maxHours)` → `'fresh'|'warning'|'danger'`

---

## Tests

- Tests en `tests/` con extensión `.test.jsx`
- Usan su **propia instancia de Dexie** (no importan `src/db.js`) con `fake-indexeddb`
- `vitest.setup.js` limpia la DB de test después de cada test
- La lógica compleja (stock, validaciones) debería extraerse a funciones puras para facilitar los tests

---

## Deuda técnica conocida

| Área | Problema |
|---|---|
| `HistorialVentas.jsx` | Usa `currentSeller?.name !== 'Admin'` en vez de `role === 'admin'` |
| `SellerSelect.jsx` | Lockout guardado en `localStorage` por vendedor; se puede evadir borrando el storage |
| `crypto.js` | Salt hardcodeado (`_pasteleria_salt_2026`); no es por instalación |
| `Configuracion.jsx` | Import de JSON no valida estructura; puede corromper la DB |
| Tests | Solo existe 1 archivo de tests; la cobertura es mínima |
| Sin CI/CD | No hay GitHub Actions ni pipeline automatizado |

---

## Áreas de alto riesgo al modificar

1. **`src/db.js`** – Cualquier cambio al schema requiere una nueva versión. Un error aquí puede hacer que usuarios existentes pierdan datos.
2. **Lógica de trozado en `Ventas.jsx`** – Es el flujo de negocio más crítico. Cambios sin entender el modelo `entero/trozado` rompen el stock de vitrina.
3. **`src/utils/crypto.js`** – Cambiar el salt o el algoritmo de hash invalida todos los PINs existentes.
4. **`src/utils/seedData.js`** – Si la condición de "solo seedear si está vacío" falla, puede duplicar datos.
5. **`src/utils/autoBackup.js`** – Disparar backups no esperados puede ser molesto para el usuario final.
