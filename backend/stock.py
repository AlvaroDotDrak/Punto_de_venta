"""Movimientos de stock de productos.

Único punto del sistema que modifica `products.stock`. Antes había seis lugares
distintos haciendo `product.stock += ...` y el número quedaba sin explicación:
al cerrar el día se sabía cuánto quedaba, pero no cuánto había entrado. Todo
cambio pasa por acá y deja su línea en `stock_movements`.
"""
from sqlalchemy.orm import Session

from .models import Product, StockMovement

# Tipos de movimiento. El signo lo lleva `quantity`, no el tipo: un ajuste puede
# sumar o restar según lo que se haya contado.
INGRESO = "ingreso"       # reposición / producción del día
VENTA = "venta"
ANULACION = "anulacion"   # devolución al anular una venta
COMPRA = "compra"         # factura de proveedor (o su reversa, en negativo)
MERMA = "merma"           # se botó: vencido, roto, en mal estado
AJUSTE = "ajuste"         # se contó y no cuadraba


def record_stock(
    db: Session,
    product: Product,
    tipo: str,
    quantity: float,
    *,
    seller_id: int | None = None,
    sale_id: int | None = None,
    expense_id: int | None = None,
    notes: str | None = None,
) -> StockMovement | None:
    """Mueve el stock del producto y anota el movimiento.

    `quantity` va con signo: positivo entra, negativo sale. Devuelve None sin
    tocar nada si el producto no lleva inventario (`stock is None`), igual que
    hacían las compras: asignarle un número lo volvería bloqueable en el POS.
    """
    if product is None or product.stock is None:
        return None

    product.stock = (product.stock or 0) + quantity

    movement = StockMovement(
        product_id=product.id,
        type=tipo,
        quantity=quantity,
        stock_after=product.stock,
        seller_id=seller_id,
        sale_id=sale_id,
        expense_id=expense_id,
        notes=notes,
    )
    db.add(movement)
    return movement
