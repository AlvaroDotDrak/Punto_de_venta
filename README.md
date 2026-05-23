# Punto de Venta – Pastelería

Sistema POS (Point of Sale) para panadería/pastelería. Backend FastAPI + SQLite, frontend React servido como SPA.

## Inicio rápido

```bash
# 1. Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con valores secretos propios

# 2. Arrancar la app
bash inicio.sh        # Linux
inicio.bat            # Windows
```

La app queda disponible en **http://localhost:8000**.

## Configuración

Antes de iniciar por primera vez, copia `.env.example` a `.env` y define los valores:

```env
PIN_SALT=tu_salt_secreto
JWT_SECRET_KEY=tu_clave_jwt_secreta
```

- **PIN_SALT** — se usa para hashear los PINs de vendedores. Cambiarlo invalida todos los PINs existentes.
- **JWT_SECRET_KEY** — firma los tokens de sesión. Debe ser una cadena larga y aleatoria (`openssl rand -hex 32`).

Credenciales demo:

| Usuario    | PIN  | Rol   |
|------------|------|-------|
| Admin      | 1234 | admin |
| Vendedor 1 | 0000 | seller |

## Stack

| Capa | Tecnología |
|---|---|
| Backend | FastAPI + SQLAlchemy + SQLite |
| Auth | JWT (`python-jose`) + SHA-256 para PINs |
| Frontend | React 18 + Vite 6 |
| Gráficos | Chart.js 4 |
| Reportes | openpyxl (export Excel contable) |

## Módulos

| Módulo | Ruta | Roles |
|---|---|---|
| Punto de Venta (POS) | `/` | todos |
| Vitrina (frescura) | `/vitrina` | todos |
| Visicooler (bebidas) | `/visicooler` | todos |
| Control de Caja | `/caja` | todos |
| Pedidos por encargo | `/pedidos` | todos |
| Gastos operativos | `/gastos` | todos |
| Productos (CRUD) | `/productos` | admin |
| Insumos | `/insumos` | admin |
| Dashboard | `/dashboard` | admin |
| Historial Ventas | `/historial` | admin |
| Contabilidad | `/contabilidad` | admin |
| Facturas | `/facturas` | admin |
| Vendedores | `/vendedores` | admin |
| Configuración | `/configuracion` | admin |

## Desarrollo frontend

```bash
npm install
npm run dev      # dev server en http://localhost:5173 (proxy → :8000)
npm run build    # compilar para producción → dist/
npm run test     # Vitest
npx eslint src/
```

> Después de cada cambio de frontend, ejecutar `npm run build` para que el backend sirva la versión actualizada.

## Estructura del proyecto

```
backend/
  main.py          # lifespan, routers, SPA catch-all, migraciones
  models.py        # modelos SQLAlchemy
  schemas.py       # schemas Pydantic
  auth.py          # JWT + hash PIN
  audit.py         # log de auditoría
  seed.py          # datos demo
  routers/         # un archivo por módulo de la API
src/
  pages/           # una página por ruta
  components/      # Layout (Sidebar, Header) + componentes compartidos
  context/         # SellerContext, ToastContext
  utils/           # api.js, formatters.js
inicio.sh          # script de inicio Linux
requirements.txt   # dependencias Python (versiones fijadas)
```

## API principal

Todos los endpoints bajo `/api/`. Autenticación: `Authorization: Bearer <token>`.

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/api/login` | Obtener JWT |
| GET | `/api/products` | Listar productos |
| POST | `/api/sales` | Registrar venta |
| POST | `/api/sales/{id}/void` | Anular venta (admin) |
| GET | `/api/showcase` | Estado de vitrina |
| GET | `/api/accounting/summary` | Resumen contable |
| GET | `/api/accounting/export` | Export Excel (admin) |
| GET | `/api/expenses` | Listar gastos |
| POST | `/api/expenses` | Registrar gasto |
| GET/POST | `/api/invoices` | Facturas a empresas (admin) |
