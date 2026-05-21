# MEMORY.md - Pastelería Tía Julia POS Memory

## Contexto del Proyecto
*   **Nombre del Negocio:** Pastelería Tía Julia (ex "Pastelería").
*   **Usuarios del Sistema:**
    *   **Álvaro (Dueño/Desarrollador):** Administra el sistema y registra contabilidad/gastos los fines de semana.
    *   **Tía de Álvaro:** Vende durante la semana (anteriormente prefería usar un cuaderno por flojera/lentitud en el registro manual de vitrina).
    *   **Mamá de Álvaro:** Repostera (abastece la vitrina).

---

## Logros e Hitos Recientes

### 1. Identidad Visual Premium ("Artisan Premium")
*   Se unificaron los estilos con glassmorphism, tipografías elegantes (Plus Jakarta Sans y Fraunces) y sombras suaves.
*   Se aplicó el nombre **"Pastelería Tía Julia"** en todo el software (Sidebar, boletas, Dashboard y Contabilidad).

### 2. Dashboard Analítico V5.0
*   Añadido gráfico de **"Flujo de Ventas por Hora"** (gráfico de líneas dinámico).
*   **Top 10/50 Productos:** Selector para ordenar por "Ganancia" ($) o "Unidades" (volumen). Vista expandible con scroll interno.

### 3. Contabilidad Premium V5.1
*   Rediseño total con tarjetas KPI en gradientes.
*   Panel de estimación de IVA (F29) al estilo estado de cuenta formal (Débito vs Crédito fiscal).
*   Solucionado error de carga inicial (`ReferenceError` e iconos faltantes).

### 4. Flujo de Venta Ultra Rápido ("Vitrina Automática")
*   **Propósito:** Eliminar la necesidad de usar el cuaderno debido a bloqueos de stock en vitrina.
*   **Lógica Backend:** Si se vende un producto de vitrina (entero o trozo) que no está registrado físicamente en vitrina, el sistema lo crea y marca como vendido automáticamente.
*   **Lógica de Trozado Automático:** Si se vende un trozo y no hay unidades trozadas activas, el sistema crea automáticamente una torta entera, la marca como troceada (`sliced`), descuenta el trozo vendido, y deja el resto de trozos (ej. 7 si el producto rinde 8) activos en la vitrina para futuras ventas.
*   **UI Dinámica:** Los botones de stock 0 en el POS cambian a `✨ Auto-cargar` y `✨ Auto-trocear` para guiar al usuario visualmente.

---

### 5. Módulo de Recetas e Insumos Dinámicos
*   **Enfoque de Lote Promedio:** Las recetas se definen por "Rendimiento del lote" (ej: rinde 30 alfajores). Al vender, el sistema descuenta la proporción (ej: 1/30) de forma automática.
*   **Reversión en Anulación (`void_sale`):** Los consumos se asocian a las ventas por `sale_id` y se revierten automáticamente al anular la venta (devolviendo el stock y borrando los movimientos de uso).
*   **Unidades al Guardar y Negativos:** Conversión de unidades al guardar en base de datos para mantener consistencia. El stock de insumos no bloquea el POS; permite stock negativo.
*   **Interfaz Premium:** Modal interactivo `RecipeModal.jsx` para definir recetas, con cálculo automático de costos de lote, unitarios y márgenes de ganancia teóricos en tiempo real.

---

## Estado Actual y Pendientes (Próxima Sesión)
*   [ ] **Verificación en Producción:** Evaluar el comportamiento del sistema de vitrina automática y de recetas con el uso real de Álvaro y su familia.
*   [ ] **Control de Mermas/Ajustes Manuales:** Desarrollar el módulo para registrar pérdidas de insumos o realizar ajustes de inventario manuales semanales en bodega.
*   [ ] **Feedback del Usuario:** Verificar si la tía de Álvaro ha dejado de usar el cuaderno definitivamente gracias a estas mejoras.
