# Plan de Implementación — Rentabilidad por Producto

**Autor:** Claude Code  
**Para:** Becario (agy)  
**Objetivo:** Agregar costo de compra a productos, mostrar margen en tarjetas y un reporte de rentabilidad en Contabilidad.

---

## Contexto y lógica de negocio

Hay dos formas de conocer el costo de un producto:

1. **Productos con receta** (vitrina, salados, encargo): el costo unitario ya se puede calcular desde `ProductRecipe`. La fórmula es:
   ```
   cost_per_unit = SUM(ingredient.last_price × recipe_item.quantity) / yield_qty
   ```
   `yield_qty` está en `ProductRecipe` (mismo valor en todos los items de un producto).

2. **Productos sin receta** (bebidas, café): se compran a un proveedor y se revenden. No tienen ingredientes. Necesitan un campo `cost_price` manual en la tabla `products`.

El margen bruto en ambos casos:
```
margen = (precio_venta - costo_unitario) / precio_venta × 100
```

---

## Fase 1 — Backend

### 1.1 Migración
En `backend/main.py`, dentro de `_run_migrations()`, agregar:
```python
try:
    conn.execute(text("ALTER TABLE products ADD COLUMN cost_price FLOAT"))
    conn.commit()
except Exception:
    pass
```

### 1.2 Modelos y Schemas
- **`backend/models.py`**: agregar `cost_price = Column(Float, nullable=True)` a `Product`
- **`backend/schemas.py`**:
  - `ProductCreate`: agregar `cost_price: Optional[float] = None`
  - `ProductUpdate`: agregar `cost_price: Optional[float] = None`
  - `ProductOut`: agregar `cost_price: Optional[float] = None` y `cost_per_unit: Optional[float] = None`

  > `cost_per_unit` es un campo computado — se calcula en el router, no viene de la DB.

### 1.3 Endpoint `GET /api/products`
En `backend/routers/products.py`, modificar `list_products` para:
1. Hacer `joinedload(Product.recipes).joinedload(ProductRecipe.ingredient)` (ya carga recetas, agregar el ingredient)
2. Para cada producto, calcular `cost_per_unit`:
   ```python
   def compute_cost_per_unit(product):
       if product.recipes:
           total = sum(r.ingredient.last_price * r.quantity for r in product.recipes if r.ingredient)
           yield_qty = product.recipes[0].yield_qty
           return round(total / yield_qty, 2) if yield_qty > 0 else None
       if product.cost_price is not None:
           return product.cost_price
       return None
   ```
3. Incluir `cost_per_unit` en el dict enriquecido que ya se retorna.

Agregar al inicio del archivo:
```python
from ..models import Product, Sale, SaleItem, ProductRecipe, Ingredient
```

### 1.4 Nuevo endpoint de rentabilidad
En `backend/routers/accounting.py`, agregar:

```
GET /api/accounting/profitability?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD
```

Lógica:
1. Buscar todos los `SaleItem` de ventas `status='completed'` en el rango de fechas
2. Agrupar por `product_id`
3. Para cada producto, cargar sus recetas + ingredientes y calcular `cost_per_unit` (misma función que arriba)
4. Retornar lista ordenada por ganancia bruta descendente:

```python
{
    "product_id": int,
    "product_name": str,
    "category": str,
    "units_sold": int,
    "revenue": float,           # sum(sale_item.subtotal)
    "cost_per_unit": float | None,
    "total_cost": float | None, # cost_per_unit * units_sold
    "gross_profit": float | None,
    "margin_percent": float | None
}
```

Solo incluir productos que tengan `cost_per_unit` calculable. Los que no tienen ni receta ni `cost_price` se excluyen del reporte.

---

## Fase 2 — Frontend: Productos

### 2.1 Campo `cost_price` en el formulario
En `Productos.jsx`, en la sección "Precios e Inventario" del modal, agregar para las categorías `bebidas` y `cafe`:

```jsx
{['bebidas', 'cafe'].includes(form.category) && (
  <div className="form-group">
    <label className="form-label">Precio de costo (compra)</label>
    <input className="form-input form-input-price" type="number" min="0" step="100"
      placeholder="Lo que pagas al proveedor"
      value={form.cost_price}
      onChange={e => updateField('cost_price', e.target.value)} />
  </div>
)}
```

Agregar `cost_price: ''` al `emptyForm` y al `handleEdit`.
En el `payload` del `handleSubmit`, incluir:
```js
cost_price: ['bebidas', 'cafe'].includes(form.category) && parseFloat(form.cost_price) > 0
  ? parseFloat(form.cost_price)
  : null,
```

### 2.2 Barra de margen en las tarjetas
En `Productos.jsx`, dentro de `product-card-body`, después del precio, agregar:

```jsx
{(() => {
  const cost = p.cost_per_unit;
  if (!cost || !p.price) return null;
  const margin = Math.round(((p.price - cost) / p.price) * 100);
  const color = margin >= 60 ? 'var(--color-success)' : margin >= 30 ? '#D4AC0D' : 'var(--color-danger)';
  const icon = margin >= 60 ? '✓' : margin >= 30 ? '~' : '✗';
  return (
    <div className="product-margin-bar">
      <div className="product-margin-track">
        <div className="product-margin-fill" style={{ width: `${Math.min(margin, 100)}%`, background: color }} />
      </div>
      <span className="product-margin-label" style={{ color }}>{margin}% {icon}</span>
    </div>
  );
})()}
```

Agregar en `src/index.css`:
```css
.product-margin-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}
.product-margin-track {
  flex: 1;
  height: 4px;
  background: var(--color-border);
  border-radius: 99px;
  overflow: hidden;
}
.product-margin-fill {
  height: 100%;
  border-radius: 99px;
  transition: width 0.4s ease;
}
.product-margin-label {
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}
```

---

## Fase 3 — Frontend: Contabilidad

### 3.1 Sección de rentabilidad en `Contabilidad.jsx`
Agregar una nueva sección debajo de las existentes, usando el mismo rango de fechas de la página.

1. No existe `Promise.all` ni `fetchData()`. La carga está en funciones independientes (`loadSummary()`, `loadLosses()`). Hay una función `loadProfitability()` ya esbozada — completarla y llamarla junto a las demás en los manejadores de fechas, con su propio `try/catch` y estado de loading.
2. Guardar resultado en estado `profitability`
3. Agregar estado `sortProfit` con opciones: `ganancia` (default), `margen`, `unidades`
4. Ordenar la lista localmente según `sortProfit`

La tabla debe mostrar:
- Columnas: Producto | Uds | Ingresos | Costo total | Margen (barra + %)
- Fila de totales al pie: suma de unidades, ingresos, costo y ganancia neta
- Un aviso debajo explicando cuántos productos fueron excluidos por no tener costo definido (si aplica)
- Color del margen: verde ≥60%, amarillo 30–59%, rojo <30%

---

## Orden de implementación

1. Migración + modelo + schemas (1.1 y 1.2)
2. `GET /api/products` con `cost_per_unit` (1.3)
3. Formulario con `cost_price` (2.1)
4. Barra de margen en tarjetas (2.2)
5. Endpoint `profitability` (1.4)
6. Tabla en Contabilidad (3.1)
7. `npm run build` + verificación manual
8. Commit: `feat: rentabilidad por producto (cost_price, margen en tarjetas, reporte contabilidad)`

---

## Estado del plan

Plan validado por el becario. Correcciones incorporadas:
- `ProductRecipe` e `Ingredient` deben importarse explícitamente en `products.py`
- `Contabilidad.jsx` no tiene `Promise.all` — usar `loadProfitability()` independiente con su propio `try/catch`

**Proceder con la implementación en el orden indicado.**
