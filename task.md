# Tareas de Implementación - Fase 3

- [x] **1. Backend - Schemas**
    - [x] Definir esquemas `LossSummaryItem`, `LossReasonItem`, `LossesReport` y `RestockSuggestion` en `schemas.py`

- [x] **2. Backend - Bodega e Insumos**
    - [x] Modificar `add_movement` en `backend/routers/ingredients.py` para calcular el costo de mermas si no se provee
    - [x] Implementar endpoint `GET /api/ingredients/restock` en `backend/routers/ingredients.py` (antes de las rutas por id)

- [x] **3. Backend - Contabilidad y Exportación**
    - [x] Implementar endpoint `GET /api/accounting/losses` en `backend/routers/accounting.py`
    - [x] Modificar exportación Excel en `/api/accounting/export` para añadir la pestaña `"Detalle Mermas"`

- [x] **4. Frontend - Bodega y Reabastecimiento**
    - [x] Agregar panel de reabastecimiento sugerido en `Insumos.jsx` con opción de copiado al portapapeles

- [x] **5. Frontend - Reporte de Mermas**
    - [x] Integrar indicadores financieros de mermas en la vista de Contabilidad (`Contabilidad.jsx`)

- [x] **6. Verificación**
    - [x] Validar sintaxis de routers con `python3 -m py_compile`
    - [x] Compilar frontend con `npm run build`
    - [x] Realizar pruebas manuales de registro, reporte y exportación

- [/] **7. Commit & Reporte**
    - [ ] Ejecutar Git commit y reportar avance a Álvaro
