# Tarea: Permisos granulares de vendedores + plantillas de rol (presets)

Ampliar el sistema de permisos de `seller`. Hoy un seller solo tiene:
`products_access` (none/view/full), `can_access_insumos`, `can_access_historial`.
Se agregan **4 permisos nuevos** (acciones sensibles) y **plantillas de rol** para
configurarlos rápido.

La infraestructura ya existe: el helper genérico `require_permission(perm)` en
`backend/auth.py` (línea ~122) admite cualquier columna booleana del seller y **siempre
deja pasar al admin**. Aprovecharlo, no inventar nada nuevo.

Permisos nuevos (todos booleanos, default `False`):

| Permiso | Qué controla | Hoy |
|---|---|---|
| `can_void_sales` | Anular ventas | hardcodeado solo-admin |
| `can_close_cash` | Cerrar la caja | hardcodeado solo-admin |
| `can_cash_movements` | Ingresos/retiros de caja | **abierto a cualquiera** (se cierra el hueco) |
| `can_view_costs` | Ver precio de costo y márgenes | visible para cualquiera con acceso a Productos |

> **NO incluir descuentos** (`can_discount`): la función de descuentos en el POS no existe
> todavía, así que no hay nada que permisar. Queda para otra tarea.

---

## Reglas (OBLIGATORIAS — leer antes de tocar nada)

1. **No hacer commit.** Implementar, correr `npm run build`, verificar y reportar. Claude Code revisa y commitea.
2. **Trabajar en `master` directamente.** No crear branches.
3. **Tras cualquier cambio de frontend, correr `npm run build`.** **Nunca editar `dist/` a mano.**
4. **Migraciones:** columnas nuevas SOLO con `_add_column_if_missing(...)` dentro de
   `_run_migrations()` en `backend/main.py`. Nunca borrar ni recrear tablas.
5. **Backend:** usar `datetime.now()`, nunca `datetime.utcnow()`.
6. **Regresión cero para admin:** el admin debe seguir pudiendo hacer TODO. `require_permission`
   ya deja pasar al admin; verificar que así sea en cada endpoint tocado.
7. **No agregar comentarios** salvo que el WHY sea no obvio.
8. **Convenciones:** camelCase en español (frontend), snake_case (backend), seguir la estructura existente.
9. **Solo editar los archivos listados** en cada fase.

---

## FASE 1 — Backend

### 1.1. Columnas nuevas en `Seller`

**`backend/models.py`** — en la clase `Seller`, después de `can_access_historial`:
```python
    can_void_sales = Column(Boolean, default=False)
    can_close_cash = Column(Boolean, default=False)
    can_cash_movements = Column(Boolean, default=False)
    can_view_costs = Column(Boolean, default=False)
```

**`backend/main.py`** — dentro de `_run_migrations()`, junto a las migraciones de `sellers`
existentes (`can_access_insumos`, `can_access_historial`):
```python
        # permisos granulares de vendedores
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_void_sales BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_close_cash BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_cash_movements BOOLEAN DEFAULT 0")
        _add_column_if_missing(conn, "ALTER TABLE sellers ADD COLUMN can_view_costs BOOLEAN DEFAULT 0")
```

### 1.2. Schemas

**`backend/schemas.py`** — agregar los 4 campos:
- En `SellerUpdate` (todos `Optional[bool] = None`, junto a `can_access_historial`).
- En `SellerOut` (todos `bool`, junto a `can_access_historial`).

> No tocar `SellerCreate`: los permisos se asignan al editar, igual que hoy con
> `products_access`/`can_access_*`.

### 1.3. Gating en endpoints

**`backend/routers/sales.py`** — endpoint `void_sale` (línea ~233). Cambiar la dependencia
`admin=Depends(require_admin)` por:
```python
    seller=Depends(require_permission("can_void_sales")),
```
Renombrar el parámetro `admin` → `seller` y actualizar cualquier uso dentro de la función
(p. ej. `admin.id` en el `log_action` → `seller.id`). Importar `require_permission` si no
está ya en el import de `..auth`.

**`backend/routers/cash.py`**:
- `close_register` (línea ~172): cambiar `admin=Depends(require_admin)` por
  `seller=Depends(require_permission("can_close_cash"))` y actualizar usos de `admin`
  dentro de la función (→ `seller`).
- `add_movement` (línea ~214): cambiar `seller=Depends(get_current_seller)` por
  `seller=Depends(require_permission("can_cash_movements"))`.
- Ajustar el import de `..auth` para incluir `require_permission` (hoy importa
  `get_current_seller, require_admin`). Dejar `require_admin`/`get_current_seller` si otros
  endpoints del archivo los siguen usando.

**`backend/routers/products.py`** — ocultar costos a quien no tenga `can_view_costs`.
En `list_products`, ya se arma `p_dict` por producto. Resolver una vez antes del loop si el
seller puede ver costos, y si no, anular los campos de costo:
```python
def list_products(
    active_only: bool = True,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    ...
    can_see_costs = seller.role == "admin" or seller.can_view_costs
    ...
    for p in products:
        p_dict = {**p.__dict__}
        p_dict["has_recipe"] = len(p.recipes) > 0
        cost_per_unit = compute_cost_per_unit(p)
        p_dict["cost_per_unit"] = cost_per_unit if can_see_costs else None
        if not can_see_costs:
            p_dict["cost_price"] = None
        p_dict["units_sold"] = units_sold_map.get(p.id, 0)
        result.append(p_dict)
```
(El parámetro hoy es `_=Depends(get_current_seller)`; renombrarlo a `seller=` para poder
leer el permiso.)

---

## FASE 2 — Frontend: Productos (ocultar costos)

Los nuevos campos del seller ya fluyen al frontend vía `SellerOut` → `GET /me` →
`currentSeller`, igual que `products_access`. No hace falta tocar contexto.

**`src/pages/Productos.jsx`**

2.1. Calcular el permiso (junto a `canEdit`, línea ~42):
```js
  const canViewCosts = currentSeller?.role === 'admin' || currentSeller?.can_view_costs;
```

2.2. Barra de margen (bloque IIFE en línea ~221, `const cost = p.cost_per_unit; ...`):
envolver para que NO se muestre si `!canViewCosts`. Como el backend ya manda
`cost_per_unit: null` en ese caso, el `if (!cost ...) return null` existente ya lo cubre,
**pero** agregar también el guard explícito al inicio del IIFE por robustez:
```js
                if (!canViewCosts) return null;
```

2.3. Campo "Precio de costo (compra)" en el formulario (línea ~437,
`{(isStockCat(form.category) || form.category === 'cafe') && (...)}`): añadir `canViewCosts &&`
a la condición para que sellers sin permiso no vean ni editen el costo.

---

## FASE 3 — Frontend: gating de acciones (Caja + Historial)

**`src/pages/HistorialVentas.jsx`** (LEER primero) — el botón/acción de anular venta debe
mostrarse solo si el usuario puede. Donde hoy se decide mostrar "Anular" por rol admin,
cambiar a:
```js
  const canVoid = currentSeller?.role === 'admin' || currentSeller?.can_void_sales;
```
y usar `canVoid` para renderizar el botón de anulación. (`currentSeller` vía `useSeller()`.)

**`src/pages/Caja.jsx`** (LEER primero) — dos gates:
- Botón "Cerrar caja": mostrar solo si `currentSeller.role === 'admin' || currentSeller.can_close_cash`.
- UI de movimientos (ingreso/retiro de efectivo): mostrar solo si
  `currentSeller.role === 'admin' || currentSeller.can_cash_movements`.

Si el seller no tiene el permiso, no renderizar el control (no basta con deshabilitar).

---

## FASE 4 — Frontend: Vendedores (UI agrupada + presets)

**`src/pages/Vendedores.jsx`**

4.1. `emptyForm` (línea ~12): agregar los 4 campos nuevos en `false`:
```js
  can_void_sales: false,
  can_close_cash: false,
  can_cash_movements: false,
  can_view_costs: false,
```

4.2. `handleSubmit` → objeto `patch` (línea ~60): incluir los 4 campos nuevos.

4.3. `handleEdit` → `setForm({...})` (línea ~82): incluir los 4 (con `!!seller.xxx`).

4.4. **Presets de rol.** Arriba del componente, definir las plantillas:
```js
const PERMISSION_PRESETS = {
  cajero: { products_access: 'none', can_access_insumos: false, can_access_historial: false,
    can_void_sales: false, can_close_cash: false, can_cash_movements: false, can_view_costs: false },
  encargado: { products_access: 'view', can_access_insumos: false, can_access_historial: true,
    can_void_sales: true, can_close_cash: true, can_cash_movements: true, can_view_costs: false },
  bodeguero: { products_access: 'full', can_access_insumos: true, can_access_historial: false,
    can_void_sales: false, can_close_cash: false, can_cash_movements: false, can_view_costs: true },
};
```
En el bloque de permisos del modal (visible solo en edición + rol `seller`), agregar arriba
una fila de botones que apliquen un preset al form (mezclándolo, sin pisar name/pin/role):
```jsx
<div className="form-group">
  <label className="form-label">Plantilla rápida</label>
  <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
    {[['cajero','Cajero'],['encargado','Encargado'],['bodeguero','Bodeguero']].map(([k,lbl]) => (
      <button key={k} type="button" className="btn btn-secondary btn-sm"
        onClick={() => setForm(prev => ({ ...prev, ...PERMISSION_PRESETS[k] }))}>{lbl}</button>
    ))}
  </div>
  <small style={{ color: 'var(--color-text-light)' }}>
    Aplica un set de permisos; podés ajustarlos abajo.
  </small>
</div>
```

4.5. **Agrupar los permisos** en el modal con subtítulos para que se entienda. Estructura
sugerida (cada uno un checkbox como los actuales `can_access_*`):
- **Inventario:** Productos (select actual), Acceso a Insumos, Ver costos y márgenes (`can_view_costs`).
- **Caja:** Cerrar caja (`can_close_cash`), Ingresos/retiros de caja (`can_cash_movements`).
- **Ventas:** Acceso a Historial, Anular ventas (`can_void_sales`).

Usar el mismo patrón de `form-group` + checkbox + label que ya tienen `can_access_insumos`
y `can_access_historial`. Para los subtítulos, reutilizar `section-title` (como ya se usa en
"Permisos adicionales").

---

## Verificación final (marcar al terminar)

- [ ] Backend arranca (`python -c "from backend.main import app"`); migración corre sin error.
- [ ] `npx vitest run` — todo verde.
- [ ] `npm run build` — sin errores.
- [ ] **Admin:** puede anular ventas, cerrar caja, hacer movimientos de caja y ver costos (regresión cero).
- [ ] **Seller sin permisos:** no ve el botón de anular, ni cerrar caja, ni movimientos; en
      Productos no ve márgenes ni el campo de costo. La API devuelve 403 si fuerza esas acciones.
- [ ] **Seller con `can_void_sales`:** puede anular; sin él, 403.
- [ ] **Seller con `can_close_cash` / `can_cash_movements`:** puede cerrar caja / registrar
      movimientos respectivamente; sin ellos, 403.
- [ ] **Seller con `can_view_costs`:** ve costos y márgenes en Productos; sin él, no.
- [ ] Presets en Vendedores aplican el set correcto y los checkboxes quedan ajustables.
- [ ] **No hacer commit — esperar revisión de Claude Code.**

## Notas
- `require_permission(perm)` ya existe en `backend/auth.py` y deja pasar al admin; no duplicar lógica.
- Para probar en limpio: borrar `pasteleria.db*` y levantar con `inicio_dev.bat` (puerto 8001).
- Si `GET /me` no devuelve los campos nuevos en el frontend, verificar que el endpoint use
  `SellerOut` (router `backend/routers/auth.py`).
