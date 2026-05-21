# Tareas de Implementación - Mejoras Módulo de Productos

Lee `.agents/skills/frontend-design/SKILL.md` antes de comenzar los puntos de frontend.
El objetivo de diseño es: **artisan premium con vida** — las tarjetas deben sentirse como fichas de producto de una confitería de lujo, con micro-interacciones sutiles, jerarquía visual clara y un modal que sea un placer usar.

---

- [ ] **1. Backend — `has_recipe` en ProductOut**
    - [ ] En `backend/schemas.py`, agregar el campo `has_recipe: bool = False` a `ProductOut`
    - [ ] En `backend/routers/products.py`, modificar el endpoint `GET /api/products` para cargar las recetas con `joinedload(Product.recipes)` y calcular `has_recipe` como `len(product.recipes) > 0` en cada resultado. Dado que `ProductOut` usa `from_attributes`, agregar el campo computado requiere un validator o retornar dicts enriquecidos — usar el enfoque que menos modifique la arquitectura existente (se recomienda un `@computed_field` o sobrescribir el endpoint para retornar dicts enriquecidos con `{**product.__dict__, "has_recipe": bool(product.recipes)}`)

---

- [ ] **2. Frontend — Reactivar productos desactivados**
    - [ ] En `Productos.jsx`, en la sección de acciones de cada tarjeta (`product-card-actions`), agregar un botón "Reactivar" que solo se muestre cuando `!p.active`
    - [ ] El botón llama a `api.patch('/products/${p.id}', { active: true })` y recarga la lista
    - [ ] Usar ícono `RotateCcw` de lucide-react para el botón

---

- [ ] **3. Frontend — Precio de trozo sugerido automático**
    - [ ] En `Productos.jsx`, en el bloque del formulario donde aparece el campo `slice_price` (solo visible cuando `form.category === 'vitrina'`), calcular en tiempo real `suggestedSlicePrice = Math.round(parseFloat(form.price) / parseInt(form.slices))` cuando ambos valores sean válidos
    - [ ] Mostrar debajo del input el texto: `Precio sugerido: $X.XXX (precio ÷ trozos)` con el valor formateado via `formatCurrency`
    - [ ] Si `form.price` o `form.slices` no son válidos, no mostrar la sugerencia
    - [ ] Agregar un botón pequeño "Usar sugerido" que copie el valor calculado al campo `slice_price`

---

- [ ] **4. Frontend — Indicador visual de receta vinculada**
    - [ ] En `Productos.jsx`, dentro de `product-card-body`, mostrar un badge `Con receta` cuando `p.has_recipe === true`
    - [ ] El badge debe usar el ícono `ChefHat` (14px) de lucide-react junto al texto, con color `var(--color-success)` o un tono verde cálido que armonice con la paleta de la pastelería
    - [ ] El badge debe ir debajo de la línea de categoría y precio, antes de la info de trozos/stock

---

- [ ] **5. Frontend — Ordenamiento de la grilla**
    - [ ] En `Productos.jsx`, agregar un selector `<select>` en la barra de filtros junto al buscador y las tabs de categoría
    - [ ] Opciones: `nombre_asc` (Nombre A→Z), `nombre_desc` (Nombre Z→A), `precio_asc` (Precio ↑), `precio_desc` (Precio ↓)
    - [ ] Aplicar el orden en el `useMemo` que ya existe para `filtered`, después del filtrado por categoría y búsqueda
    - [ ] Valor por defecto: `nombre_asc`

---

- [ ] **6. Diseño — Tarjetas de producto (aplicar skill frontend-design)**
    - [ ] Abrir `.agents/skills/frontend-design/SKILL.md` y aplicar sus lineamientos al área de productos
    - [ ] Mejorar `product-card` en `src/index.css` o en estilos inline de `Productos.jsx`:
        - Hover con `transform: translateY(-3px)` + sombra más pronunciada + transición `0.2s ease`
        - Foto del producto con `aspect-ratio: 4/3` y `object-fit: cover` para consistencia
        - Emoji fallback centrado con fondo sutil (degradado radial muy suave en `--color-bg`)
        - Precio con tipografía `font-family: var(--font-heading)` para mayor carácter visual
        - Badges de categoría más distintivos: background sólido con color según categoría (vitrina→naranja suave, bebidas→azul suave, salados→amarillo mostaza, café→café tostado, encargo→rosa palo)
        - Línea divisora sutil entre foto/emoji y el body de la tarjeta
    - [ ] Tarjetas inactivas: opacidad `0.45` y un ribbon o badge "Inactivo" en esquina superior

---

- [ ] **7. Diseño — Modal de nuevo/editar producto (aplicar skill frontend-design)**
    - [ ] Mejorar la estructura visual del modal:
        - Sección de foto al inicio del modal con área de drop visual (borde punteado animado en hover, ícono centrado `Camera` grande)
        - Separadores visuales con títulos de sección: "Información básica", "Configuración de vitrina" (condicional), "Foto"
        - Botones de selección de categoría con el emoji más grande y un estado `active` más pronunciado (fondo `--color-primary` con texto blanco)
        - Campos de precio en grid de 2 columnas con tipografía de input más grande (`font-size: 1.1rem`, `font-weight: 600`)
        - Footer del modal con `background: var(--color-bg)` y borde superior para separarlo del contenido
    - [ ] Agregar una transición de entrada al modal (`@keyframes` o clase CSS con `animation: slideUp 0.2s ease`)

---

- [ ] **8. Verificación**
    - [ ] Ejecutar `python3 -m py_compile backend/schemas.py backend/routers/products.py` para validar sintaxis Python
    - [ ] Ejecutar `npm run build` para compilar frontend
    - [ ] Verificar manualmente:
        - Un producto activo muestra sus acciones normales (editar, estadísticas, receta, desactivar)
        - Un producto inactivo muestra el botón "Reactivar" y se ve diferente visualmente
        - Al crear producto de vitrina, se muestra precio sugerido de trozo en tiempo real
        - Productos con receta muestran el badge verde
        - El selector de ordenamiento reordena la grilla correctamente
        - El modal abre con animación, las secciones están visualmente separadas
        - Las tarjetas tienen hover con elevación

---

- [ ] **9. Commit & Reporte**
    - [ ] Git commit: `feat: mejoras módulo productos (reactivar, precio sugerido, indicador receta, ordenamiento, diseño)`
    - [ ] Actualizar `memory/dev-state.json` con estado completado
    - [ ] Reportar a Álvaro con resumen de cambios realizados
