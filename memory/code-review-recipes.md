---
name: code-review-recipes
description: Revisión de código del módulo de recetas hecha por Claude — bugs a corregir antes de declarar la feature lista
metadata:
  type: project
  reviewer: Claude (Sonnet 4.6)
  reviewed_at: 2026-05-20
---

# Code Review: Módulo de Recetas e Insumos Dinámicos

Revisión del código implementado. La arquitectura general es sólida. Se encontraron **3 bugs** y **3 issues de calidad**.

---

## 🔴 Bug 1 — `last_price` siempre 0 al cargar recetas existentes

**Archivo:** `src/components/Productos/RecipeModal.jsx:79`

```js
last_price: item.ingredient?.last_price || 0  // ← bug
```

`ProductRecipeOut` no tiene campo `ingredient` anidado — solo tiene `ingredient_name` e `ingredient_unit` como strings planos. `item.ingredient` es siempre `undefined`, así que todos los costos se muestran $0 al editar una receta ya guardada.

**Fix recomendado:** cruzar con el array `ingredients` ya cargado:

```js
// En el .map() de recipeData (línea ~69), después de cargar ingData:
const ing = ingData.find(i => i.id === item.ingredient_id);
// ...
last_price: ing?.last_price || 0
```

O bien, agregar `ingredient_last_price: float` a `ProductRecipeOut` en `schemas.py` y el `@property` correspondiente en el modelo.

---

## 🟠 Bug 2 — `getConversionFactor` retorna 1.0 silenciosamente para unidades incompatibles

**Archivo:** `src/components/Productos/RecipeModal.jsx:37`

```js
return factors[key] !== undefined ? factors[key] : 1.0;  // fallback silencioso
```

Si el usuario elige `kg` para un ingrediente cuya unidad base es `ml`, el factor devuelve 1.0 sin advertencia. El backend lanzará 422 al guardar, pero el panel de costos mostrará valores incorrectos en tiempo real.

**Fix:** retornar `null` cuando el par es incompatible y mostrar un aviso en la fila del ingrediente:

```js
return factors[key] !== undefined ? factors[key] : null;
// En costCalculations: si factor es null → rowCost = null → mostrar "⚠ Unidades incompatibles"
```

---

## 🟠 Bug 3 — `toast.info` puede no existir en ToastContext

**Archivo:** `src/components/Productos/RecipeModal.jsx:138`

```js
toast.info(`Consolidado '${ing.name}' sumando la cantidad.`);
```

El CLAUDE.md del proyecto solo documenta `toast.success` y `toast.error`. Si `ToastContext` no expone `.info`, esto lanza silenciosamente sin consolidar. Verificar el contexto y cambiar a `toast.success` si no existe.

---

## 🟡 Calidad 1 — Import de `UniqueConstraint` en mitad de `models.py`

**Archivo:** `backend/models.py:198`

```python
from sqlalchemy import UniqueConstraint  # ← en medio del archivo, antes de ProductRecipe
```

Debería ir arriba junto al resto de imports de `sqlalchemy` (línea 2). Funciona igual pero rompe la convención del archivo.

---

## 🟡 Calidad 2 — Doble query al mismo producto en `create_sale`

**Archivo:** `backend/routers/sales.py:137-148`

```python
# Bloque bebidas (línea 137)
product = db.query(Product).filter(Product.id == item_in.product_id).first()

# Bloque recetas (línea 148) — misma query innecesaria
product = db.query(Product).filter(Product.id == item_in.product_id).first()
```

Hacer una sola query al inicio del loop (o reutilizar el objeto `product` del primer bloque) antes de los dos `if`.

---

## 🟡 Calidad 3 — Audit log usa acción incorrecta en `recipes.py`

**Archivo:** `backend/routers/recipes.py:125`

```python
log_action(db, ACTIONS.INGREDIENT_MOVEMENT, admin.id, f"Receta actualizada ...")
```

`INGREDIENT_MOVEMENT` es para movimientos de stock (compras, ajustes, usos). Guardar una receta no es eso — contamina el historial de insumos con eventos de configuración.

**Fix:** usar `ACTIONS.PRODUCT_UPDATE`, o agregar `RECIPE_UPDATED = "recipe_updated"` al objeto `ACTIONS` en `backend/audit.py`.

---

## Resumen

| Prioridad | Problema | Archivo |
|---|---|---|
| 🔴 Bug | `last_price = 0` al cargar recetas existentes | `RecipeModal.jsx:79` |
| 🟠 Bug | Conversión incompatible retorna 1.0 silencioso | `RecipeModal.jsx:37` |
| 🟠 Bug | `toast.info` puede no existir | `RecipeModal.jsx:138` |
| 🟡 Calidad | Import `UniqueConstraint` en mitad del archivo | `models.py:198` |
| 🟡 Calidad | Doble query al mismo producto | `sales.py:137-148` |
| 🟡 Calidad | Acción de audit incorrecta para recetas | `recipes.py:125` |
