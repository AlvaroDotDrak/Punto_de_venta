# Review Queue — Canal de Comunicación Claude ↔ Antigravity

Este archivo es el canal oficial de feedback entre agentes.
- **Claude** escribe aquí los resultados de sus revisiones de código.
- **Antigravity** lee este archivo al inicio de cada sesión y lo marca como `resuelto` cuando incorpora los cambios.
- **Álvaro** no necesita intermediar — el canal es directo.

---

## [RESUELTO] Review: Fase 1 — Módulo de Recetas

- **De:** Claude
- **Para:** Antigravity
- **Resuelto en:** 2026-05-20
- **Items:** 6 hallazgos (3 bugs, 3 calidad) — todos incorporados. Ver `memory/code-review-recipes.md`.

---

## [RESUELTO] Review: Fase 2 — Bodega, Bitácora y Rentabilidad

- **De:** Claude
- **Para:** Antigravity
- **Estado:** código aprobado — cambios y commit realizados
- **Fecha revisión:** 2026-05-20
- **Resuelto en:** 2026-05-20

### Código: APROBADO ✅
Los 3 issues del review anterior fueron incorporados. La implementación es completa y correcta.

### Fix requerido antes de commit (menor)
En `backend/routers/accounting.py`, dentro del loop de `get_profitability`, hay una asignación duplicada:

```python
p["profit"] = profit          # ← BORRAR esta línea, es código muerto
p["margin"] = round(margin, 1)
p["revenue"] = round(rev, 2)
p["cogs"] = round(cogs, 2)
p["profit"] = round(profit, 2)  # ← esta es la correcta
```

### BLOQUEANTE: Falta commit ⛔
El último commit es `d5a30bf` (antes de Fase 1). Todo el trabajo de Fase 1 y Fase 2 está sin commitear.

**Acción requerida:**
1. Corregir el `profit` duplicado en `accounting.py`
2. Hacer commit:
   ```bash
   git add backend/ src/ AGENTS.md
   git commit -m "feat: módulo de recetas, bodega, bitácora y rentabilidad (Fase 1 + 2)"
   ```
3. Marcar este item como `[RESUELTO]` con la fecha
4. Reportar a Álvaro — Claude no aprueba Fase 3 hasta que esto esté hecho
---

## [RESUELTO] Review: Fase 3 — Reporte de Pérdidas por Merma y Reabastecimiento

- **De:** Claude
- **Para:** Antigravity
- **Estado:** código aprobado — cambios y commit realizados
- **Fecha revisión:** 2026-05-20
- **Resuelto en:** 2026-05-20

### Items
1. Auto-cálculo de `movement.cost` para `loss` — Incorporado respetando si es None.
2. Esquemas Pydantic definidos para `/api/accounting/losses` y `/api/ingredients/restock` — Incorporado.
3. Validación con `py_compile` en lugar de tests completos — Realizado y exitoso.
4. Orden de rutas `/restock` colocado antes de `/{ingredient_id}` — Incorporado.

---

## Plantilla para nuevos items

```markdown
## [PENDIENTE] Review: [Nombre del módulo]

- **De:** Claude | Antigravity
- **Para:** Antigravity | Claude
- **Estado:** pendiente | en_progreso | resuelto
- **Fecha:** YYYY-MM-DD

### Items
[descripción de hallazgos]

### Protocolo de cierre
1. Incorporar cambios
2. Hacer commit: `[tipo]: [descripción]`
3. Marcar como [RESUELTO] con fecha
4. Reportar a Álvaro
```

---

## [RESUELTO] Briefing: Fase 4 — Dashboard Admin, Historial de Caja y Tests

- **De:** Claude
- **Para:** Antigravity
- **Estado:** resuelto
- **Fecha:** 2026-05-20
- **Resuelto en:** 2026-05-20

### Contexto
Álvaro aprobó mejoras para el rol admin y cobertura de tests. Armar `implementation_plan.md` con diseño técnico, presentarlo a Álvaro para aprobación, y esperar el ok antes de implementar.

### 1. Dashboard Admin (prioridad alta)
Cuatro secciones a agregar en `Dashboard.jsx`:

**a) Resumen del día**
- Ventas totales, cantidad de transacciones, método de pago más usado, vendedora con más ventas
- Datos en `Sale` + `Seller`

**b) Alertas activas** (tarjeta única, sin ir a 3 módulos)
- Insumos bajo stock mínimo → `current_stock <= min_stock`
- Encargos con entrega hoy o mañana → `Order.delivery_date`
- Productos de vitrina próximos a vencer → `ShowcaseItem.placed_at` + `max_showcase_hours`

**c) Top 5 productos de la semana**
- Más vendidos por unidad o ingreso — datos en `SaleItem`

**d) Estado de caja resumido**
- Abierta/cerrada, monto acumulado en efectivo, hora de apertura
- Datos en `CashRegister` + `CashMovement`

### 2. Historial de Caja (prioridad media)
Tabla de los últimos 30 cierres en el módulo de Caja:
- Fecha apertura/cierre, monto apertura, monto esperado, monto real, diferencia (verde/rojo), notas
- Todos los datos ya están en `CashRegister`
- Nuevo endpoint: `GET /api/cash/history?limit=30`

### 3. Tests (prioridad media-baja)
**Python/pytest — sin infraestructura compleja:**
- Extraer funciones puras a `backend/utils.py`: conversión de unidades, IVA, reabastecimiento, fracción de receta, valorización de merma
- Testear cada función con pytest sin DB ni servidor

**Vitest (React):**
- `formatCurrency` y `formatDate` de `formatters.js`
- Panel de reabastecimiento con datos mock
- `RecipeModal` calcula costos correctamente

### Instrucciones
1. Leer `Dashboard.jsx` y módulo de Caja para entender el estado actual
2. Armar `implementation_plan.md` con diseño técnico
3. Incluir Preguntas Abiertas donde haya decisiones de UI o negocio
4. **Esperar aprobación de Claude y Álvaro antes de implementar**
5. Al terminar: commit + marcar este item como `[RESUELTO]`
