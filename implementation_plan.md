# Plan de Implementación: Reporte de Pérdidas por Merma y Sugerencias de Reabastecimiento (Fase 3 - Revisado)

Este plan detalla el diseño e implementación de las herramientas de optimización de bodega y control de pérdidas financieras, incorporando las observaciones técnicas del revisor y las decisiones de negocio.

---

## Decisiones de Diseño & Negocio

> [!IMPORTANT]
> **1. Valorización de Mermas (`loss`) con Histórico:**
> Al registrar una merma, el backend calculará automáticamente y guardará el costo real en el momento del registro (`cost = quantity * ingredient.last_price`). De esta forma, el historial captura el valor exacto del insumo y no depende de variaciones de precios futuras.
>
> **2. Ubicación en la Interfaz:**
> El Reporte de Mermas se integrará en la sección de **Contabilidad** (Opción A), dado su impacto directo en los costos y flujo de caja del negocio.
>
> **3. Exportación Contable:**
> Se agregará una cuarta pestaña llamada `"Detalle Mermas"` al archivo Excel generado en `/api/accounting/export` para facilitarle el trabajo al contador.
>
> **4. Lógica de Sugerencia de Recompra:**
> Se utilizará la fórmula simple de reposición: `Cantidad Sugerida = (min_stock * 2) - current_stock`, lo que evita agregar columnas adicionales a la base de datos y mantiene la lógica ligera.

---

## Cambios Propuestos

### 1. Backend (FastAPI)

#### [MODIFY] [ingredients.py](file:///home/alvaro/punto_de_venta/backend/routers/ingredients.py)
*   **En la creación de movimientos (`add_movement`):**
    *   Si el tipo es `"loss"`, calcular y persistir el costo histórico:
        ```python
        elif payload.type in ("usage", "loss"):
            ingredient.current_stock -= payload.quantity
            if payload.type == "loss":
                movement.cost = payload.quantity * ingredient.last_price
        ```

*   **Endpoint `/api/ingredients/restock`:**
    *   Retorna los insumos cuyo stock es inferior al `min_stock`.
    *   Aplica la fórmula `suggested = (item.min_stock * 2) - item.current_stock`.
    *   Mapea y retorna la lista usando un esquema Pydantic para mantener coherencia en las firmas de la API.

#### [MODIFY] [schemas.py](file:///home/alvaro/punto_de_venta/backend/schemas.py)
*   Definir los esquemas Pydantic para el reporte de mermas y la lista de reabastecimiento:
    ```python
    class LossSummaryItem(BaseModel):
        ingredient_id: int
        name: str
        quantity: float
        unit: str
        total_cost: float

    class LossReasonItem(BaseModel):
        notes: str
        total_cost: float
        count: int

    class LossesReport(BaseModel):
        date_from: str
        date_to: str
        total_loss_cost: float
        by_ingredient: list[LossSummaryItem]
        by_reason: list[LossReasonItem]

    class RestockSuggestion(BaseModel):
        ingredient_id: int
        name: str
        current_stock: float
        min_stock: float
        unit: str
        suggested_qty: float
        estimated_cost: float
    ```

#### [MODIFY] [accounting.py](file:///home/alvaro/punto_de_venta/backend/routers/accounting.py)
*   **`GET /api/accounting/losses` (con response_model `LossesReport`):**
    *   Calcula el total financiero de pérdidas filtrando `IngredientMovement` por tipo `"loss"` en el rango de fechas.
    *   Construye las listas agrupadas por insumo y por descripción/nota de merma.
*   **`GET /api/accounting/export`:**
    *   Modificar la exportación a Excel para añadir la pestaña `"Detalle Mermas"` listando: Fecha, Insumo, Cantidad, Unidad, Costo de Pérdida, Motivo y Operador.

---

### 2. Frontend (React)

#### [MODIFY] [Contabilidad.jsx](file:///home/alvaro/punto_de_venta/src/pages/Contabilidad.jsx)
*   Añadir una sección o tarjeta en la pestaña de **Rentabilidad Real** para desplegar el resumen financiero de mermas.
*   Mostrar tablas/gráficos que ilustren qué insumos se pierden más y las razones de las pérdidas (mermas).

#### [MODIFY] [Insumos.jsx](file:///home/alvaro/punto_de_venta/src/pages/Insumos.jsx)
*   Agregar un panel dinámico de **Sugerencias de Pedido** cuando haya ingredientes bajo el mínimo.
*   Permitir copiar el listado de compras sugerido en formato texto plano al portapapeles para uso rápido.

---

## Plan de Verificación

### Validación de Código y Sintaxis
*   Verificar que no haya errores de compilación de Python en los routers mediante:
    `python3 -m py_compile backend/routers/accounting.py backend/routers/ingredients.py`
*   Verificar que el bundle frontend se compile exitosamente usando:
    `npm run build`

### Pruebas Manuales (Base de Datos Real)
1.  **Registro de Mermas:** Registrar una merma (ej. 2 unidades de huevo) y verificar en la base de datos que `cost` se complete automáticamente en el registro de movimiento con el costo histórico correspondiente.
2.  **Reporte de Mermas:** Abrir la pantalla de Contabilidad, ir al rango de fechas respectivo y corroborar que los costos por merma coincidan.
3.  **Excel Export:** Generar el reporte Excel y validar que la pestaña `"Detalle Mermas"` tenga el formato y registros correctos.
4.  **Reabastecimiento:** Configurar un ingrediente bajo stock mínimo, abrir la vista de Insumos y verificar que la lista sugiera la cantidad calculada por la fórmula y el costo estimado.
