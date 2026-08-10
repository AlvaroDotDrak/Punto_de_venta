import os
import sys

os.environ["PIN_SALT"] = "test_salt_12345"
os.environ["JWT_SECRET_KEY"] = "test_jwt_secret_12345"

import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import Base
from backend.models import Product, Sale, SaleItem, CashRegister, CashMovement, Seller
from backend.schemas import VoidSaleRequest
from backend.routers.sales import void_sale

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_void_sale_restores_physical_stock_and_creates_void_cash_movement(db_session):
    db = db_session

    # 1. Crear vendedor
    seller = Seller(name="Test Seller", pin="1234", role="admin", can_void_sales=True)
    db.add(seller)
    db.commit()

    # 2. Crear caja abierta
    register = CashRegister(opening_amount=10000.0, status="open", opened_by="Test Seller")
    db.add(register)
    db.commit()

    # 3. Crear producto con stock inicial de 10
    product = Product(name="Empanada", price=2000.0, stock=10.0, sold_by="unit", category="salados")
    db.add(product)
    db.commit()

    # 4. Crear venta de 2 empanadas por debito
    # Descontar stock manualmente como lo hace create_sale
    product.stock -= 2.0
    sale = Sale(total=4000.0, payment_method="debito", seller_id=seller.id, status="completed")
    db.add(sale)
    db.commit()

    item = SaleItem(sale_id=sale.id, product_id=product.id, product_name="Empanada", price=2000.0, quantity=2, subtotal=4000.0)
    db.add(item)
    
    sale_mov = CashMovement(register_id=register.id, type="sale", amount=4000.0, payment_method="debito", sale_id=sale.id, seller_id=seller.id)
    db.add(sale_mov)
    db.commit()

    assert product.stock == 8.0

    # 5. Anular la venta
    req = VoidSaleRequest(reason="Error en cobro al cliente con tarjeta")
    void_sale(sale.id, req, db=db, seller=seller)

    # 6. Verificar que el stock fue restaurado a 10.0
    db.refresh(product)
    assert product.stock == 10.0

    # 7. Verificar que la venta quedo voided
    db.refresh(sale)
    assert sale.status == "voided"

    # 8. Verificar que se creo un CashMovement de tipo void con monto -4000.0 y payment_method 'debito'
    void_mov = db.query(CashMovement).filter(CashMovement.sale_id == sale.id, CashMovement.type == "void").first()
    assert void_mov is not None
    assert void_mov.amount == -4000.0
    assert void_mov.payment_method == "debito"
