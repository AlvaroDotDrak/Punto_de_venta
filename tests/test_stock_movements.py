"""Libreta del stock: `record_stock` y todo lo que escribe en `stock_movements`.

La regla que sostiene el módulo es que `products.stock` solo se mueve por acá.
Estos tests la vigilan desde los dos lados: que cada camino legítimo deje su
línea, y que los caminos cerrados (editar el stock desde la ficha del producto)
sigan cerrados.
"""
import os
import sys

os.environ.setdefault("PIN_SALT", "test_salt_12345")
os.environ.setdefault("JWT_SECRET_KEY", "test_jwt_secret_12345")

import pytest
from datetime import datetime, timedelta
from pydantic import ValidationError
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import Base
from backend.models import (
    AuditLog, CashRegister, Expense, ExpenseCategory, Product, Sale, SaleItem,
    Seller, StockMovement,
)
from backend.schemas import (
    ProductUpdate, PurchaseCreate, PurchaseItemIn, RestockBulkLine,
    RestockBulkRequest, RestockRequest, SaleCreate, SaleItemIn,
    StockAdjustRequest, StockWriteoffRequest, VoidSaleRequest,
)
from backend.stock import AJUSTE, COMPRA, INGRESO, MERMA, VENTA, record_stock
from backend.routers.products import (
    adjust_product_stock, list_stock_movements, restock_bulk, restock_product,
    update_product, writeoff_product,
)
from backend.routers.purchases import create_purchase, delete_purchase
from backend.routers.sales import create_sale, void_sale


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


@pytest.fixture
def seller(db):
    s = Seller(name="Macarena", pin="1234", role="admin", can_void_sales=True)
    db.add(s)
    db.commit()
    return s


@pytest.fixture
def producto(db):
    p = Product(name="Ceviche Mixto 500 Grs", price=8500.0, stock=10.0,
                sold_by="unit", category="ceviches")
    db.add(p)
    db.commit()
    return p


@pytest.fixture
def sin_inventario(db):
    """stock=None: el café de máquina y los productos por receta no llevan conteo."""
    p = Product(name="Café", price=1500.0, stock=None, category="cafe")
    db.add(p)
    db.commit()
    return p


def movimientos(db, product_id):
    return (db.query(StockMovement)
            .filter(StockMovement.product_id == product_id)
            .order_by(StockMovement.id).all())


# ── record_stock: el helper ───────────────────────────────────────────────────

def test_suma_y_deja_el_saldo_en_stock_after(db, producto, seller):
    record_stock(db, producto, INGRESO, 20, seller_id=seller.id)
    db.commit()

    assert producto.stock == 30.0
    mov, = movimientos(db, producto.id)
    assert (mov.type, mov.quantity, mov.stock_after) == (INGRESO, 20, 30.0)
    assert mov.seller_id == seller.id


def test_resta_con_cantidad_negativa(db, producto, seller):
    record_stock(db, producto, VENTA, -3, seller_id=seller.id)
    db.commit()

    assert producto.stock == 7.0
    assert movimientos(db, producto.id)[0].stock_after == 7.0


def test_stock_after_sigue_el_saldo_acumulado(db, producto, seller):
    for tipo, cantidad in ((INGRESO, 20), (VENTA, -3), (MERMA, -2), (AJUSTE, 5)):
        record_stock(db, producto, tipo, cantidad, seller_id=seller.id)
    db.commit()

    assert [m.stock_after for m in movimientos(db, producto.id)] == [30.0, 27.0, 25.0, 30.0]
    assert producto.stock == 30.0


def test_producto_sin_inventario_no_genera_movimiento(db, sin_inventario, seller):
    """stock=None significa "no lleva inventario". Darle un número lo volvería
    bloqueable en el POS al llegar a 0."""
    resultado = record_stock(db, sin_inventario, INGRESO, 50, seller_id=seller.id)
    db.commit()

    assert resultado is None
    assert sin_inventario.stock is None
    assert movimientos(db, sin_inventario.id) == []


def test_producto_none_no_revienta(db):
    assert record_stock(db, None, INGRESO, 5) is None


def test_guarda_la_trazabilidad_completa(db, producto, seller):
    record_stock(db, producto, COMPRA, 12, seller_id=seller.id,
                 sale_id=None, expense_id=99, notes="Compra F-123")
    db.commit()

    mov, = movimientos(db, producto.id)
    assert (mov.expense_id, mov.notes) == (99, "Compra F-123")
    assert mov.created_at is not None


# ── Reponer ───────────────────────────────────────────────────────────────────

def test_restock_registra_ingreso(db, producto, seller):
    restock_product(producto.id, RestockRequest(quantity=25), db=db, seller=seller)

    assert producto.stock == 35.0
    mov, = movimientos(db, producto.id)
    assert (mov.type, mov.quantity) == (INGRESO, 25)


def test_restock_a_producto_sin_inventario_falla(db, sin_inventario, seller):
    with pytest.raises(HTTPException) as e:
        restock_product(sin_inventario.id, RestockRequest(quantity=5), db=db, seller=seller)
    assert e.value.status_code == 400


def test_restock_bulk_registra_una_linea_por_producto(db, producto, seller):
    otro = Product(name="Ceviche Salmón", price=8500.0, stock=4.0, category="ceviches")
    db.add(otro)
    db.commit()

    resultado = restock_bulk(
        RestockBulkRequest(items=[
            RestockBulkLine(product_id=producto.id, quantity=33),
            RestockBulkLine(product_id=otro.id, quantity=15),
        ]), db=db, seller=seller)

    assert resultado.actualizados == 2
    assert (producto.stock, otro.stock) == (43.0, 19.0)
    assert movimientos(db, producto.id)[0].notes == "Carga del día"
    assert movimientos(db, otro.id)[0].quantity == 15


def test_restock_bulk_omite_los_que_no_llevan_inventario(db, producto, sin_inventario, seller):
    resultado = restock_bulk(
        RestockBulkRequest(items=[
            RestockBulkLine(product_id=producto.id, quantity=10),
            RestockBulkLine(product_id=sin_inventario.id, quantity=10),
        ]), db=db, seller=seller)

    assert resultado.actualizados == 1
    assert len(resultado.avisos) == 1
    assert movimientos(db, sin_inventario.id) == []


def test_restock_bulk_con_producto_inexistente_no_guarda_nada(db, producto, seller):
    """Todo o nada: dejar el inventario a medio cargar es peor que no cargarlo."""
    with pytest.raises(HTTPException) as e:
        restock_bulk(RestockBulkRequest(items=[
            RestockBulkLine(product_id=producto.id, quantity=10),
            RestockBulkLine(product_id=99999, quantity=5),
        ]), db=db, seller=seller)

    assert e.value.status_code == 404
    db.rollback()
    assert producto.stock == 10.0
    assert movimientos(db, producto.id) == []


# ── Merma ─────────────────────────────────────────────────────────────────────

def test_merma_descuenta_y_guarda_el_motivo(db, producto, seller):
    writeoff_product(producto.id, StockWriteoffRequest(quantity=3, reason="Vencido"),
                     db=db, seller=seller)

    assert producto.stock == 7.0
    mov, = movimientos(db, producto.id)
    assert (mov.type, mov.quantity, mov.notes) == (MERMA, -3, "Vencido")


def test_merma_mayor_al_stock_falla_sin_tocar_nada(db, producto, seller):
    with pytest.raises(HTTPException) as e:
        writeoff_product(producto.id, StockWriteoffRequest(quantity=11, reason="Vencido"),
                         db=db, seller=seller)

    assert e.value.status_code == 400
    assert producto.stock == 10.0
    assert movimientos(db, producto.id) == []


def test_merma_deja_el_stock_exactamente_en_cero(db, producto, seller):
    writeoff_product(producto.id, StockWriteoffRequest(quantity=10, reason="Se botó todo"),
                     db=db, seller=seller)
    assert producto.stock == 0.0


def test_merma_a_producto_sin_inventario_falla(db, sin_inventario, seller):
    with pytest.raises(HTTPException) as e:
        writeoff_product(sin_inventario.id, StockWriteoffRequest(quantity=1, reason="Vencido"),
                         db=db, seller=seller)
    assert e.value.status_code == 400


def test_merma_a_producto_inexistente_da_404(db, seller):
    with pytest.raises(HTTPException) as e:
        writeoff_product(99999, StockWriteoffRequest(quantity=1, reason="Vencido"),
                         db=db, seller=seller)
    assert e.value.status_code == 404


@pytest.mark.parametrize("quantity,reason", [
    (0, "Vencido"),      # cantidad debe ser > 0
    (-5, "Vencido"),
    (1, ""),             # el motivo es obligatorio
    (1, "ab"),           # y de al menos 3 caracteres
])
def test_merma_rechaza_payloads_invalidos(quantity, reason):
    with pytest.raises(ValidationError):
        StockWriteoffRequest(quantity=quantity, reason=reason)


def test_merma_registra_en_auditoria(db, producto, seller):
    writeoff_product(producto.id, StockWriteoffRequest(quantity=2, reason="En mal estado"),
                     db=db, seller=seller)

    log = db.query(AuditLog).filter(AuditLog.action == "STOCK_WRITEOFF").one()
    assert "En mal estado" in log.details
    assert log.seller_id == seller.id


# ── Ajuste ────────────────────────────────────────────────────────────────────

def test_ajuste_hacia_abajo(db, producto, seller):
    """`counted` es lo que hay de verdad, no la diferencia."""
    adjust_product_stock(producto.id, StockAdjustRequest(counted=7, reason="Se contó el físico"),
                         db=db, seller=seller)

    assert producto.stock == 7.0
    mov, = movimientos(db, producto.id)
    assert (mov.type, mov.quantity, mov.stock_after) == (AJUSTE, -3, 7.0)


def test_ajuste_hacia_arriba(db, producto, seller):
    adjust_product_stock(producto.id, StockAdjustRequest(counted=14, reason="Había más"),
                         db=db, seller=seller)

    assert producto.stock == 14.0
    assert movimientos(db, producto.id)[0].quantity == 4


def test_ajuste_sin_diferencia_no_registra_movimiento(db, producto, seller):
    adjust_product_stock(producto.id, StockAdjustRequest(counted=10, reason="Cuadra"),
                         db=db, seller=seller)

    assert producto.stock == 10.0
    assert movimientos(db, producto.id) == []


def test_ajuste_a_cero_es_valido(db, producto, seller):
    adjust_product_stock(producto.id, StockAdjustRequest(counted=0, reason="No quedaba nada"),
                         db=db, seller=seller)
    assert producto.stock == 0.0


@pytest.mark.parametrize("counted,reason", [(-1, "Motivo"), (5, ""), (5, "ab")])
def test_ajuste_rechaza_payloads_invalidos(counted, reason):
    with pytest.raises(ValidationError):
        StockAdjustRequest(counted=counted, reason=reason)


def test_ajuste_registra_el_antes_y_el_despues_en_auditoria(db, producto, seller):
    adjust_product_stock(producto.id, StockAdjustRequest(counted=3, reason="Se contó"),
                         db=db, seller=seller)

    log = db.query(AuditLog).filter(AuditLog.action == "STOCK_ADJUST").one()
    assert "10 → 3" in log.details


# ── La ficha del producto no puede mover stock ────────────────────────────────

def test_product_update_no_tiene_campo_stock():
    """La puerta de atrás: mover inventario obligaba a abrir la ficha, donde
    también están el nombre y el precio. En producción eso renombró un producto
    en pleno servicio."""
    assert "stock" not in ProductUpdate.model_fields


def test_product_update_ignora_un_stock_inyectado(db, producto, seller):
    payload = ProductUpdate(**{"price": 9000, "stock": 999})
    update_product(producto.id, payload, db=db, seller=seller)

    assert producto.stock == 10.0
    assert producto.price == 9000.0
    assert movimientos(db, producto.id) == []


def test_product_update_registra_el_diff(db, producto, seller):
    update_product(producto.id, ProductUpdate(price=9000, name="Ceviche Mixto"),
                   db=db, seller=seller)

    log = db.query(AuditLog).filter(AuditLog.action == "PRODUCT_UPDATE").one()
    assert "precio 8500 → 9000" in log.details
    assert "nombre Ceviche Mixto 500 Grs → Ceviche Mixto" in log.details


def test_product_update_sin_cambios_reales_no_inventa_diff(db, producto, seller):
    update_product(producto.id, ProductUpdate(price=8500), db=db, seller=seller)

    log = db.query(AuditLog).filter(AuditLog.action == "PRODUCT_UPDATE").one()
    assert "→" not in log.details


# ── Historial ─────────────────────────────────────────────────────────────────

def test_historial_viene_del_mas_nuevo_al_mas_viejo(db, producto, seller):
    base = datetime(2026, 8, 9, 10, 0)
    for i, (tipo, cant) in enumerate(((INGRESO, 20), (VENTA, -1), (MERMA, -2))):
        mov = record_stock(db, producto, tipo, cant, seller_id=seller.id)
        mov.created_at = base + timedelta(hours=i)
    db.commit()

    historial = list_stock_movements(producto.id, limit=100, db=db, seller=seller)
    assert [m.type for m in historial] == [MERMA, VENTA, INGRESO]
    assert historial[0].seller_name == "Macarena"


def test_historial_respeta_el_limite(db, producto, seller):
    for _ in range(10):
        record_stock(db, producto, INGRESO, 1, seller_id=seller.id)
    db.commit()

    assert len(list_stock_movements(producto.id, limit=4, db=db, seller=seller)) == 4


def test_historial_de_producto_inexistente_da_404(db, seller):
    with pytest.raises(HTTPException) as e:
        list_stock_movements(99999, limit=10, db=db, seller=seller)
    assert e.value.status_code == 404


def test_historial_sin_vendedor_no_revienta(db, producto):
    record_stock(db, producto, INGRESO, 5)   # migración vieja, sin seller
    db.commit()

    assert list_stock_movements(producto.id, limit=10, db=db, seller=None)[0].seller_name is None


# ── Venta y anulación ─────────────────────────────────────────────────────────

def _caja_abierta(db):
    r = CashRegister(opening_amount=0.0, status="open", opened_by="Macarena")
    db.add(r)
    db.commit()
    return r


def test_venta_descuenta_y_registra_el_movimiento(db, producto, seller):
    _caja_abierta(db)
    create_sale(SaleCreate(
        total=17000.0, payment_method="efectivo",
        items=[SaleItemIn(product_id=producto.id, product_name=producto.name,
                          price=8500.0, quantity=2, subtotal=17000.0)],
    ), db=db, seller=seller)

    assert producto.stock == 8.0
    mov, = movimientos(db, producto.id)
    assert (mov.type, mov.quantity, mov.stock_after) == (VENTA, -2, 8.0)
    assert mov.sale_id is not None


def test_venta_sin_stock_suficiente_no_deja_movimiento(db, producto, seller):
    _caja_abierta(db)
    with pytest.raises(HTTPException) as e:
        create_sale(SaleCreate(
            total=850000.0, payment_method="efectivo",
            items=[SaleItemIn(product_id=producto.id, product_name=producto.name,
                              price=8500.0, quantity=100, subtotal=850000.0)],
        ), db=db, seller=seller)

    assert e.value.status_code == 400
    db.rollback()
    assert producto.stock == 10.0
    assert movimientos(db, producto.id) == []


def test_anular_devuelve_el_stock_y_deja_su_linea(db, producto, seller):
    _caja_abierta(db)
    venta = create_sale(SaleCreate(
        total=17000.0, payment_method="efectivo",
        items=[SaleItemIn(product_id=producto.id, product_name=producto.name,
                          price=8500.0, quantity=2, subtotal=17000.0)],
    ), db=db, seller=seller)

    void_sale(venta.id, VoidSaleRequest(reason="Se equivocó de ceviche"), db=db, seller=seller)

    assert producto.stock == 10.0
    tipos = [m.type for m in movimientos(db, producto.id)]
    assert tipos == [VENTA, "anulacion"]
    reversa = movimientos(db, producto.id)[1]
    assert reversa.quantity == 2
    assert reversa.sale_id == venta.id
    assert "Se equivocó de ceviche" in reversa.notes


def test_venta_de_producto_sin_inventario_no_ensucia_la_libreta(db, sin_inventario, seller):
    _caja_abierta(db)
    create_sale(SaleCreate(
        total=1500.0, payment_method="efectivo",
        items=[SaleItemIn(product_id=sin_inventario.id, product_name=sin_inventario.name,
                          price=1500.0, quantity=1, subtotal=1500.0)],
    ), db=db, seller=seller)

    assert sin_inventario.stock is None
    assert movimientos(db, sin_inventario.id) == []


# ── Compras ───────────────────────────────────────────────────────────────────

@pytest.fixture
def categoria_gasto(db):
    c = ExpenseCategory(name="Mercadería", active=True)
    db.add(c)
    db.commit()
    return c


def test_compra_suma_stock_y_registra(db, producto, seller, categoria_gasto):
    create_purchase(PurchaseCreate(
        category_id=categoria_gasto.id, document_type="factura", invoice_number="F-500",
        items=[PurchaseItemIn(product_id=producto.id, description="Ceviche",
                              quantity=6, unit_cost=5000)],
    ), db=db, admin=seller)

    assert producto.stock == 16.0
    mov, = movimientos(db, producto.id)
    assert (mov.type, mov.quantity) == (COMPRA, 6)
    assert mov.expense_id is not None


def test_compra_por_pack_registra_unidades_de_inventario(db, producto, seller, categoria_gasto):
    """La factura vende packs; el inventario cuenta unidades sueltas."""
    create_purchase(PurchaseCreate(
        category_id=categoria_gasto.id, document_type="factura",
        items=[PurchaseItemIn(product_id=producto.id, description="Caja x12",
                              quantity=2, unit_cost=60000, units_per_pack=12)],
    ), db=db, admin=seller)

    assert producto.stock == 34.0
    assert movimientos(db, producto.id)[0].quantity == 24


def test_borrar_compra_revierte_con_su_propia_linea(db, producto, seller, categoria_gasto):
    compra = create_purchase(PurchaseCreate(
        category_id=categoria_gasto.id, document_type="factura",
        items=[PurchaseItemIn(product_id=producto.id, description="Ceviche",
                              quantity=6, unit_cost=5000)],
    ), db=db, admin=seller)

    delete_purchase(compra.id, db=db, admin=seller)

    assert producto.stock == 10.0
    tipos_y_cant = [(m.type, m.quantity) for m in movimientos(db, producto.id)]
    assert tipos_y_cant == [(COMPRA, 6), (COMPRA, -6)]


def test_borrar_compra_no_deja_el_stock_negativo(db, seller, categoria_gasto):
    """Si parte de lo comprado ya se vendió, el faltante es real: se descuenta
    hasta 0 y se avisa, en vez de dejar un stock imposible."""
    p = Product(name="Bebida", price=1000.0, stock=0.0, category="bebidas")
    db.add(p)
    db.commit()

    compra = create_purchase(PurchaseCreate(
        category_id=categoria_gasto.id, document_type="factura",
        items=[PurchaseItemIn(product_id=p.id, description="Bebida", quantity=10, unit_cost=500)],
    ), db=db, admin=seller)
    p.stock = 4.0    # se vendieron 6
    db.commit()

    delete_purchase(compra.id, db=db, admin=seller)

    assert p.stock == 0.0
    assert movimientos(db, p.id)[-1].quantity == -4


def test_compra_no_convierte_en_controlado_un_producto_sin_inventario(db, sin_inventario, seller, categoria_gasto):
    create_purchase(PurchaseCreate(
        category_id=categoria_gasto.id, document_type="factura",
        items=[PurchaseItemIn(product_id=sin_inventario.id, description="Café",
                              quantity=5, unit_cost=3000)],
    ), db=db, admin=seller)

    assert sin_inventario.stock is None
    assert movimientos(db, sin_inventario.id) == []
    assert sin_inventario.cost_price == 3000.0   # el costo sí se actualiza siempre


# ── Backfill del audit log ────────────────────────────────────────────────────

def _conn_con_audit(db, filas):
    for i, (accion, detalle) in enumerate(filas):
        db.add(AuditLog(action=accion, seller_id=1, details=detalle,
                        created_at=datetime(2026, 8, 8, 11, i)))
    db.commit()
    return db.connection()


def test_backfill_recupera_restock_simple(db, producto):
    from backend.main import _backfill_stock_movements
    conn = _conn_con_audit(db, [
        ("PRODUCT_UPDATE", "Restock Ceviche Mixto 500 Grs: +33.0 (total: 46.0)"),
    ])
    _backfill_stock_movements(conn)

    mov, = movimientos(db, producto.id)
    assert (mov.type, mov.quantity) == ("ingreso", 33.0)
    assert mov.stock_after is None   # el saldo de entonces no es reconstruible


def test_backfill_recupera_reposicion_por_lote(db, producto):
    from backend.main import _backfill_stock_movements
    otro = Product(name="Ceviche Salmon 500 Grs", price=8500.0, stock=0.0, category="ceviches")
    db.add(otro)
    db.commit()
    conn = _conn_con_audit(db, [
        ("PRODUCT_UPDATE", "Reposición por lote: Ceviche Mixto 500 Grs +33, Ceviche Salmon 500 Grs +15"),
    ])
    _backfill_stock_movements(conn)

    assert movimientos(db, producto.id)[0].quantity == 33.0
    assert movimientos(db, otro.id)[0].quantity == 15.0


def test_backfill_omite_productos_renombrados(db, producto):
    """El ceviche que quedó como "Salmon 1 K2" ya no matchea por nombre: se omite
    en vez de adivinar a qué producto iba."""
    from backend.main import _backfill_stock_movements
    conn = _conn_con_audit(db, [
        ("PRODUCT_UPDATE", "Restock Ceviche Salmon 1 Kg: +2.0 (total: 2.0)"),
    ])
    _backfill_stock_movements(conn)

    assert db.query(StockMovement).count() == 0


def test_backfill_ignora_las_ediciones_a_mano(db, producto):
    from backend.main import _backfill_stock_movements
    conn = _conn_con_audit(db, [
        ("PRODUCT_UPDATE", "Producto actualizado: Ceviche Mixto 500 Grs"),
        ("SALE", "Venta $8500"),
    ])
    _backfill_stock_movements(conn)

    assert db.query(StockMovement).count() == 0


def test_backfill_corre_una_sola_vez(db, producto):
    from backend.main import _backfill_stock_movements
    conn = _conn_con_audit(db, [
        ("PRODUCT_UPDATE", "Restock Ceviche Mixto 500 Grs: +33.0 (total: 46.0)"),
    ])
    _backfill_stock_movements(conn)
    _backfill_stock_movements(conn)

    assert db.query(StockMovement).count() == 1
    marca = conn.execute(
        text("SELECT value FROM system_config WHERE key='stock_movements_backfilled'")
    ).fetchone()
    assert marca[0] == "true"


def test_backfill_no_toca_el_stock_actual(db, producto):
    """Es historia, no un movimiento nuevo: sumar 33 unidades que ya se vendieron
    dejaría el inventario inflado."""
    from backend.main import _backfill_stock_movements
    conn = _conn_con_audit(db, [
        ("PRODUCT_UPDATE", "Restock Ceviche Mixto 500 Grs: +33.0 (total: 46.0)"),
    ])
    _backfill_stock_movements(conn)

    db.expire(producto)
    assert producto.stock == 10.0


# ── Lo que ve la clienta: "hizo / vendió / queda" ─────────────────────────────

def _turno_con_movimientos(db, producto, seller):
    """Un turno realista: se cargan 20, se venden 2, se botan 3.

    La ventana va sobre `datetime.now()` porque las ventas y los movimientos se
    fechan solos: con fechas fijas caerían fuera del turno y el papel saldría en
    cero sin que nada esté roto.
    """
    ahora = datetime.now()
    register = CashRegister(opening_amount=0.0, status="open", opened_by="Macarena",
                            opened_at=ahora - timedelta(hours=1))
    db.add(register)
    db.commit()

    restock_product(producto.id, RestockRequest(quantity=20), db=db, seller=seller)
    create_sale(SaleCreate(
        total=17000.0, payment_method="efectivo",
        items=[SaleItemIn(product_id=producto.id, product_name=producto.name,
                          price=8500.0, quantity=2, subtotal=17000.0)],
    ), db=db, seller=seller)
    writeoff_product(producto.id, StockWriteoffRequest(quantity=3, reason="Vencido"),
                     db=db, seller=seller)

    register.status = "closed"
    register.closed_at = datetime.now() + timedelta(hours=1)
    register.closing_amount = 17000.0
    register.expected_amount = 17000.0
    db.commit()
    return register


def test_el_correo_muestra_lo_que_entro_en_el_turno(db, producto, seller):
    from backend.mailer import build_summary
    register = _turno_con_movimientos(db, producto, seller)

    _asunto, html = build_summary(db, register)

    assert "20 entraron" in html
    assert "2 vendidos" in html
    assert "25 quedan" in html   # 10 iniciales + 20 − 2 vendidos − 3 botados


def test_el_comprobante_impreso_trae_las_tres_columnas(db, producto, seller):
    from backend.routers.printing import build_close_report
    register = _turno_con_movimientos(db, producto, seller)

    papel = build_close_report(db, register).decode("cp850", "replace")

    assert "HIZO / VENDIO / QUEDA" in papel
    assert "20 / 2 / 25" in papel


def test_los_ingresos_de_otro_turno_no_se_cuelan(db, producto, seller):
    """El papel del turno cuenta lo del turno, no el acumulado del producto."""
    from backend.routers.printing import build_close_report
    record_stock(db, producto, INGRESO, 99, seller_id=seller.id)   # turno anterior
    db.query(StockMovement).filter(StockMovement.quantity == 99).one().created_at = \
        datetime.now() - timedelta(days=1)
    db.commit()

    register = _turno_con_movimientos(db, producto, seller)
    papel = build_close_report(db, register).decode("cp850", "replace")

    assert "20 / 2 / 124" in papel   # entraron 20 en ESTE turno, aunque queden 124


def test_la_merma_no_cuenta_como_ingreso(db, producto, seller):
    from backend.routers.printing import build_close_report
    register = _turno_con_movimientos(db, producto, seller)

    papel = build_close_report(db, register).decode("cp850", "replace")

    assert "17 / 2 / 25" not in papel   # 20−3 sería contar la merma como ingreso negativo
