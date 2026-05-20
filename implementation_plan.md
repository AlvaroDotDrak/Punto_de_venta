# Plan de Implementación: Gestión de Inventario - Bitácora, Compras, Mermas y Rentabilidad (Fase 2 - Revisado)

Este plan detalla la ampliación del sistema de insumos para permitir el control operativo de bodega y la visualización de la rentabilidad real del negocio en la pastelería, resolviendo los puntos críticos identificados en la revisión de arquitectura.

## Decisiones de Diseño Clave (User Review Required)

> [!IMPORTANT]
> **1. Asociación de Movimientos a Productos (`product_id`):**
> Para permitir calcular la rentabilidad a nivel de producto individual de manera directa y óptima, se agrega la columna `product_id` a la tabla `ingredient_movements` vinculando cada descuento de bodega (`usage`) con el producto vendido. Esto se ejecutará mediante la **migración v2.10**.
>
> **2. Migración Doble de Base de Datos (v2.9 y v2.10):**
> *   **v2.9:** Agrega la columna `notes` (`TEXT`, nullable) a `ingredient_movements` para descripciones de mermas y ajustes.
> *   **v2.10:** Agrega la columna `product_id` (`INTEGER`, nullable) a `ingredient_movements` vinculada a `products.id`.
>
> **3. Validación de Negocios para Mermas (`loss`):**
> El backend validará de manera estricta mediante Pydantic que cualquier movimiento de tipo `"loss"` obligatoriamente contenga una nota explicativa (`notes`), previniendo registros sin descripción desde la UI o API directa.
>
> **4. Exposición de Atributos de Insumos vía @property:**
> En lugar de crear esquemas adicionales redundantes, el modelo `IngredientMovement` implementará propiedades lazy-loading (`ingredient_name` e `ingredient_unit`) para que Pydantic las serialice de forma transparente en el listado de movimientos globales de bodega.

---

## Cambios Propuestos

### 1. Base de Datos & Backend (FastAPI)

#### [MODIFY] [models.py](file:///home/alvaro/punto_de_venta/backend/models.py)
*   Añadir la columna `notes` y `product_id`, la relación con `Product` y las propiedades auxiliares al modelo `IngredientMovement`:
    ```python
    class IngredientMovement(Base):
        # ... columnas existentes ...
        notes = Column(Text, nullable=True)  # Descripción para mermas o motivos de ajuste
        product_id = Column(Integer, ForeignKey("products.id"), nullable=True)  # Producto que causó el consumo

        # Relaciones
        product = relationship("Product")
        
        # Propiedades auxiliares expuestas a esquemas Pydantic
        @property
        def ingredient_name(self) -> str:
            return self.ingredient.name if self.ingredient else ""

        @property
        def ingredient_unit(self) -> str:
            return self.ingredient.unit if self.ingredient else ""
    ```

#### [MODIFY] [main.py](file:///home/alvaro/punto_de_venta/backend/main.py)
*   En `_run_migrations()`, agregar las migraciones v2.9 y v2.10:
    ```python
    _add_column_if_missing(conn, "ALTER TABLE ingredient_movements ADD COLUMN notes TEXT")
    _add_column_if_missing(conn, "ALTER TABLE ingredient_movements ADD COLUMN product_id INTEGER")
    ```

#### [MODIFY] [schemas.py](file:///home/alvaro/punto_de_venta/backend/schemas.py)
*   Actualizar `IngredientMovementCreate` con validador de modelo para obligar el uso de `notes` cuando es de tipo `loss`:
    ```python
    from pydantic import BaseModel, model_validator
    # ...
    class IngredientMovementCreate(BaseModel):
        type: str         # 'purchase' | 'adjustment' | 'usage' | 'loss'
        quantity: float
        cost: Optional[float] = None
        notes: Optional[str] = None

        @model_validator(mode='after')
        def notes_required_for_loss(self):
            if self.type == 'loss' and not self.notes:
                raise ValueError("Las mermas requieren una nota descriptiva")
            return self
    ```
*   Actualizar `IngredientMovementOut` para exponer la información extendida requerida por la bitácora:
    ```python
    class IngredientMovementOut(BaseModel):
        id: int
        ingredient_id: int
        ingredient_name: Optional[str] = None
        ingredient_unit: Optional[str] = None
        type: str
        quantity: float
        cost: Optional[float]
        notes: Optional[str]
        seller_id: Optional[int]
        sale_id: Optional[int]
        product_id: Optional[int]
        created_at: datetime
        seller: Optional[SellerOut] = None

        model_config = {"from_attributes": True}
    ```

#### [MODIFY] [ingredients.py](file:///home/alvaro/punto_de_venta/backend/routers/ingredients.py)
*   **Orden de rutas:** Declarar el endpoint global **antes** del endpoint dinámico por ingrediente:
    1.  `GET /api/ingredients/movements/global`:
        Retorna movimientos globales ordenados de forma descendente, aplicando `joinedload(IngredientMovement.ingredient)`.
    2.  `GET /api/ingredients/{ingredient_id}/movements`:
        Retorna movimientos específicos del insumo indicado.
*   **En la creación de movimientos (`add_movement`):**
    *   Validar que `payload.type` esté en `("purchase", "adjustment", "usage", "loss")`.
    *   Si es `loss`, descontar del inventario: `ingredient.current_stock -= payload.quantity`.
    *   Guardar `notes=payload.notes`.

#### [MODIFY] [sales.py](file:///home/alvaro/punto_de_venta/backend/routers/sales.py)
*   Al registrar el movimiento de consumo (`usage`) de insumos por receta:
    *   Guardar el costo del insumo consumido al momento de la venta (`cost = qty_used * r.ingredient.last_price`).
    *   Vincular el ID de producto vendido en el campo `product_id=item_in.product_id`.
    ```python
    movement = IngredientMovement(
        ingredient_id=r.ingredient_id,
        type="usage",
        quantity=qty_used,
        cost=qty_used * r.ingredient.last_price,  # Costo real de venta
        seller_id=seller.id,
        sale_id=sale.id,
        product_id=item_in.product_id  # Enlace crítico para rentabilidad
    )
    ```

#### [MODIFY] [accounting.py](file:///home/alvaro/punto_de_venta/backend/routers/accounting.py)
*   **Añadir endpoint de Rentabilidad Real:**
    *   `GET /api/accounting/profitability?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`
    *   Lógica:
        *   Obtener todas las ventas completadas del período.
        *   Obtener todos los movimientos de consumo (`usage`) vinculados a ventas de ese rango.
        *   Agrupar los consumos (`IngredientMovement`) por `product_id`.
        *   El costo de ingredientes (COGS) por producto se calcula sumando `movement.cost` (con fallback de `qty * ingredient.last_price` si `cost` es `None`).
        *   Cruzar los ingresos generados por producto (`sum(item.quantity * item.price)`) con su respectivo COGS para deducir el margen bruto (%) y beneficio neto.
        *   Retornar la agregación total, por categoría del producto y por producto individual.

---

### 2. Frontend (React)

#### [MODIFY] [Insumos.jsx](file:///home/alvaro/punto_de_venta/src/pages/Insumos.jsx)
*   **Alerta de Stock Mínimo:**
    *   Destacar en color de advertencia (rojo/naranja) las filas de insumos donde `current_stock <= min_stock`.
*   **UI de Compras e Ingreso de Stock:**
    *   Agregar un botón "Registrar Compra" en la tarjeta de cada insumo.
    *   Modal interactivo que solicite cantidad y costo total de compra. Llama a `POST /movements` con `type: 'purchase'`.
*   **UI de Mermas / Ajuste Manual:**
    *   Agregar botón "Registrar Merma" (o "Ajustar Stock") que despliegue un modal.
    *   El usuario selecciona el tipo (`loss` para merma física / `adjustment` para corrección) e ingresa la cantidad y un motivo/nota obligatorio. Llama a `POST /movements`.
*   **Vista de Bitácora de Bodega:**
    *   Pestaña "Historial de Bodega" para visualizar la bitácora global de movimientos, mostrando columnas de Fecha, Insumo, Tipo de Operación, Cantidad, Operador, Notas y Costo (si aplica).

#### [MODIFY] [Contabilidad.jsx](file:///home/alvaro/punto_de_venta/src/pages/Contabilidad.jsx)
*   Agregar una sección o sub-pestaña "Rentabilidad Real (COGS)" que cargue los datos de `/api/accounting/profitability`.
*   Mostrar indicadores clave (Venta total, Costo total de materia prima, Margen de ganancia bruta).
*   Mostrar un listado interactivo con barras de progreso del margen por producto, permitiendo identificar cuáles son los alfajores, tortas o pasteles más rentables.

---

## Plan de Verificación

### Pruebas Automatizadas
*   Ejecutar compilación en backend y frontend para asegurar consistencia de imports y tipos:
    *   `npm run build`
    *   `.venv/bin/python -m py_compile backend/routers/ingredients.py backend/routers/accounting.py`

### Pruebas Manuales
1.  **Migración:** Iniciar el backend y verificar en la base de datos sqlite que las columnas `notes` y `product_id` se hayan creado en la tabla `ingredient_movements`.
2.  **Validación de Notas en Mermas:** Intentar enviar un POST de movimiento tipo `loss` sin notas a través de la API y comprobar que el backend retorna un error 422.
3.  **Compras (POST /purchase):** Registrar una compra de un insumo ingresando costo y cantidad, comprobar que el stock sube y que `last_price` se recalcula correctamente.
4.  **Bitácora Global:** Entrar a la pestaña de historial en la interfaz de insumos y constatar que los movimientos registrados (compras, mermas y consumos de ventas) se listan de forma descendente con sus nombres de ingredientes y notas.
5.  **Cálculo de Rentabilidad por Producto:** Realizar una venta de un producto con receta, verificar en la base de datos sqlite que el `IngredientMovement` tiene `product_id` y `cost` correspondientes, y corroborar en la UI de contabilidad del frontend que la rentabilidad de ese producto se calcula correctamente.
