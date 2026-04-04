# ADR-0001: Lógica de Stock para Pasteles y Trozos

**Fecha:** 2026-02-16  
**Estado:** Propuesto  
**Contexto:**  
Actualmente, el sistema trata "Entero" y "Trozo" como entidades separadas o con lógica difusa. Al vender un trozo, no se descuenta proporcionalmente del stock del pastel entero, lo que genera inconsistencias en inventario (Vitrina).

**Problema:**
- Si tengo 1 Torta de Milhojas (Entera).
- Vendo 1 trozo (supongamos que salen 8 trozos por torta).
- El stock sigue mostrando 1 Torta Entera.

**Decisión:**
Implementar una lógica de "Fraccionamiento Automático" en el momento de la venta (`completeSale`):

1.  **Definición de Factor:** Cada producto categorizado como "Pastel" tendrá un metadato implícito o explícito de `slicesPerUnit` (ej: 8, 10, 12).
2.  **Conversión al Vuelo:**
    - Si se vende un **Trozo** y hay stock de **Trozo**, se descuenta Trozo.
    - Si NO hay stock de Trozo pero SÍ de Entero -> Se "abre" un Entero:
        - Stock Entero: -1
        - Stock Trozos: +(N - 1) (donde N es la cantidad de trozos por torta).
3.  **Persistencia:** Esta operación debe ser atómica en la base de datos `Dexie`.

**Consecuencias:**
- ✅ Inventario real siempre exacto.
- ✅ Automatiza la gestión de vitrina (no hay que "abrir" pasteles manualmente).
- ❌ Requiere definir cuántos trozos salen de cada pastel (configuración extra por producto).

**Alternativas consideradas:**
- *Stock Decimal:* Tratar el stock como 0.875 tortas. (Descartado por complejidad visual para el usuario).
