# Walkthrough de Implementación: Módulo de Recetas e Insumos Dinámicos

Se ha completado e integrado con éxito la implementación del sistema de recetas, costeos teóricos y descuento dinámico de insumos en bodega, solucionando todas las observaciones del proceso de auditoría y pruebas críticas.

## Cambios Realizados

### 1. Backend & Base de Datos (FastAPI)

*   **Modelos de Datos (`backend/models.py`):**
    *   Se creó la tabla `product_recipes` (`ProductRecipe`) con la clave única compuesta `UniqueConstraint("product_id", "ingredient_id", name="uq_product_ingredient")` para evitar duplicidad de insumos por receta.
    *   Se agregaron las propiedades `@property def ingredient_name(self)` e `ingredient_unit(self)` en el modelo SQLAlchemy para que Pydantic resuelva los campos directamente vía lazy loading controlado.
    *   Se añadió `sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True)` al modelo `IngredientMovement` para enlazar los usos de bodega a las ventas del POS.
    *   Se añadió la relación `recipes` en `Product` para soportar la eliminación en cascada (`cascade="all, delete-orphan"`).
*   **Migraciones y Registro de Modelos (`backend/main.py`):**
    *   Se importó explícitamente `ProductRecipe` para asegurar que `metadata.create_all()` genere la tabla nueva automáticamente en el arranque.
    *   En `_run_migrations()`, se agregó la migración manual v2.8: `_add_column_if_missing(conn, "ALTER TABLE ingredient_movements ADD COLUMN sale_id INTEGER")`.
    *   Se registró el router de recetas (`recipes.router`) en la aplicación FastAPI.
*   **Esquemas de Datos Pydantic (`backend/schemas.py`):**
    *   Se crearon los esquemas `ProductRecipeItemIn`, `ProductRecipeSave` y `ProductRecipeOut` con soporte para lectura automática de atributos.
*   **API Router de Recetas (`backend/routers/recipes.py`):**
    *   `GET /api/products/{product_id}/recipe`: Retorna los ingredientes de la receta del producto usando `joinedload(ProductRecipe.ingredient)` para prevenir problemas de carga diferida (lazy loading).
    *   `POST /api/products/{product_id}/recipe`: Permite guardar y editar la receta del producto. Implementa un mapeo de unidades comunes y **conversión de unidades al vuelo** (ej: gramos a kilogramos, mililitros a litros, unidades a docenas) para guardar todo en la unidad física base del ingrediente en bodega. Consolida ingredientes repetidos sumando sus valores.
*   **Lógica de POS & Ventas (`backend/routers/sales.py`):**
    *   **En la creación de venta (`create_sale`):**
        *   Si el producto vendido tiene receta, se calcula la fracción proporcional consumida.
        *   Si es trozo, se divide entre los cortes del producto (`product.slices` o 8 por defecto) previniendo `ZeroDivisionError`.
        *   Se calcula la cantidad de ingrediente usada en proporción al rendimiento (`yield_qty`).
        *   Se crea un `IngredientMovement` de tipo `usage` asignando el `sale_id` y restando la cantidad física de `Ingredient.current_stock`.
        *   El stock de ingredientes **permite valores negativos** para no bloquear la venta del POS en momentos de alta demanda si los ingresos físicos no se han registrado en el software.
    *   **En la anulación de venta (`void_sale`):**
        *   Se busca todo movimiento en `ingredient_movements` con el `sale_id` correspondiente.
        *   Se devuelve el stock físico al inventario sumando la cantidad consumida.
        *   Se eliminan los registros de movimientos para no distorsionar el historial de gastos.

### 2. Frontend & Interfaz de Usuario (React)

*   **Componente RecipeModal (`src/components/Productos/RecipeModal.jsx`):**
    *   Diseñado con estética premium (glassmorphism, gradientes elegantes y bordes esmerilados).
    *   Permite seleccionar ingredientes activos de una lista.
    *   Permite definir el rendimiento global de la receta (ej: rinde 1 Torta o 30 alfajores) y agregar insumos en unidades flexibles (gramos, kilos, etc.).
    *   Calcula de forma dinámica los costos totales del lote, costos unitarios teóricos basados en el `last_price` de los insumos y el porcentaje de margen teórico respecto al precio de venta del producto.
*   **Vista de Catálogo (`src/pages/Productos.jsx`):**
    *   Se integró el botón con el icono de gorro de chef 🥣 (`ChefHat`) en las acciones de las tarjetas de producto.
    *   Se enlazó la apertura y paso de datos al modal `RecipeModal`.

---

## Correcciones de Code Review Aplicadas

Se aplicaron las correcciones para los 6 hallazgos reportados en la revisión de código (`memory/code-review-recipes.md`):

1.  **Bug 1 (Carga de `last_price`):** Corregido en `RecipeModal.jsx` cruzando el ID del insumo de la receta con la lista cargada `ingData` para obtener el precio correcto, solucionando el problema de costos en $0 al re-editar.
2.  **Bug 2 (Conversiones Incompatibles):** Modificado `getConversionFactor` en `RecipeModal.jsx` para retornar `null` en lugar de `1.0` silencioso cuando las unidades no son convertibles. La UI ahora muestra un aviso de error visual `"⚠️ Unidades incompatibles"` y deshabilita el botón "Guardar Receta" para evitar errores 422 en el backend.
3.  **Bug 3 (Soporte de Toast):** Se constató que `ToastContext` implementa el método `info` en el código, por lo que la notificación de consolidado es completamente segura de usar.
4.  **Calidad 1 (Imports Limpios):** Se movió la importación de `UniqueConstraint` al encabezado superior en `backend/models.py`.
5.  **Calidad 2 (Optimización de Query):** En `backend/routers/sales.py`, se consolidaron las dos consultas repetidas a `Product` en una sola consulta al inicio del ciclo de venta, mejorando la eficiencia y reduciendo la carga a la base de datos.
6.  **Calidad 3 (Auditoría Precisa):** Se agregó la constante `RECIPE_UPDATE = "RECIPE_UPDATE"` a `ACTIONS` en `backend/audit.py` y se configuró en `recipes.py` para evitar contaminar la bitácora de movimientos físicos de insumos con logs de configuración de recetas.

---

## Verificación Realizada

1.  **Compilación del Frontend:** Se ejecutó `npm run build` completándose con éxito sin advertencias ni errores en el código agregado/modificado.
2.  **Compilación del Backend:** Se verificó la sintaxis e importaciones de todos los archivos backend modificados (`main.py`, `models.py`, `schemas.py`, `sales.py`, `recipes.py`, `audit.py`) mediante compilación de módulos en Python, finalizando exitosamente.

---

## Cómo Probar en Producción / Staging

1.  **Configurar Ingredientes:**
    *   Ve a la pestaña de **Insumos**.
    *   Crea un ingrediente "Harina de Trigo" con unidad `kg` (ej. precio base 1200 por kg) y stock inicial 5.
    *   Crea un ingrediente "Huevo" con unidad `unidad` (ej. precio base 150 por unidad) y stock inicial 60.
2.  **Crear Receta:**
    *   Ve a **Productos**, haz clic en el icono 🥣 (`Gorro de chef`) en el producto "Alfajor de Maicena".
    *   Establece el rendimiento en `30` unidades.
    *   Agrega "Harina de Trigo": `1000` `g` (el sistema la convertirá a `1` `kg` al guardar).
    *   Agrega "Huevo": `12` `unidad`.
    *   Verifica que la UI muestre el cálculo automático de costos del lote y costo por unidad. Guarda la receta.
3.  **Hacer una Venta:**
    *   Abre el POS y vende `3` unidades de "Alfajor de Maicena".
    *   Verifica en la pestaña de **Insumos** que el stock de Harina bajó a `4.9` kg (`5 - (3 * 1 / 30)`) y el de Huevos a `58.8` unidades (`60 - (3 * 12 / 30)`).
4.  **Anular la Venta:**
    *   Ve al historial de ventas y anula la venta realizada en el paso anterior.
    *   Verifica que el stock de Harina volvió a `5.0` kg y el de Huevo a `60.0` unidades, y que no existan remanentes de movimientos tipo `usage` en el historial de insumos para esa venta.
