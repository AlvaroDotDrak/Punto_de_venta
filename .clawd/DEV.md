# DEV.md - Punto de Venta Pastelería (Development Guide)

**Estado:** 🚧 En Desarrollo  
**Stack:** React + Vite + Dexie.js (IndexedDB)  
**Entorno:** Local (Navegador)

## 🏗️ Arquitectura

La aplicación es un **Single Page Application (SPA)** diseñada para funcionar 100% offline.

### Componentes Clave

1.  **Frontend:** React 18 con Vite.
2.  **Persistencia:** `Dexie.js` (Wrapper de IndexedDB) para almacenar productos, ventas y configuración localmente en el navegador.
3.  **Estilos:** CSS Modules / CSS global (`index.css`) con variables CSS para temas.
4.  **Routing:** `react-router-dom` para la navegación entre módulos (Ventas, Caja, Vitrina).

### 📂 Estructura de Directorios

- `src/db.js`: Definición del esquema de la base de datos (Single Source of Truth).
- `src/pages/`: Vistas principales (Ventas, Caja, Pedidos, Vitrina).
- `src/components/`: Componentes reutilizables UI.
- `src/context/`: Gestión de estado global (SellerContext, ToastContext).

## 🛠️ Stack Tecnológico

| Tecnología | Versión | Propósito |
| :--- | :--- | :--- |
| **React** | ^18.3.1 | UI Framework |
| **Vite** | ^6.0.5 | Build Tool & Dev Server |
| **Dexie.js** | ^4.0.11 | Base de datos local (IndexedDB) |
| **Chart.js** | ^4.4.7 | Gráficos en Dashboard |
| **Lucide React** | ^0.469.0 | Iconos SVG |
| **Date-fns** | ^4.1.0 | Manejo de fechas |

## 🚀 Flujo de Desarrollo

1.  **Iniciar Servidor:** `npm run dev`
2.  **Build Producción:** `npm run build`
3.  **Tests:** *Pendiente de configuración (Vitrina)*

## ⚠️ Deuda Técnica / Pendientes

- **Impresión:** Ajustes de CSS para impresoras térmicas (Parche aplicado mediante CSS print media).
- **Testing:** No hay suite de pruebas configurada.

## ✅ Funcionalidades Completadas

- **Gestión de Stock (Trozos):** Implementada lógica de "Auto-Slice" (ADR-0001).
    - Descuenta 1 trozo si hay sueltos.
    - Abre pastel entero automáticamente si no hay trozos.
    - Crea (N-1) trozos nuevos en vitrina.
