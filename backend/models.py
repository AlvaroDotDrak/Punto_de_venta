from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey,
    Integer, String, Text
)
from sqlalchemy.orm import relationship
from .database import Base


class Seller(Base):
    __tablename__ = "sellers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    pin = Column(String, nullable=False)          # SHA-256 hash
    role = Column(String, default="seller")       # 'admin' | 'seller'
    active = Column(Boolean, default=True)
    failed_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    sales = relationship("Sale", back_populates="seller")
    audit_logs = relationship("AuditLog", back_populates="seller")
    ingredient_movements = relationship("IngredientMovement", back_populates="seller")
    expenses = relationship("Expense", back_populates="seller")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False)     # 'vitrina' | 'salados' | 'encargo' | 'bebidas' | 'cafe'
    price = Column(Float, nullable=False)
    slices = Column(Integer, default=8)           # trozos por unidad (solo vitrina)
    slice_price = Column(Float, nullable=True)    # precio por trozo (None = sin precio fijo)
    max_showcase_hours = Column(Integer, nullable=True, default=48)
    stock = Column(Integer, nullable=True)        # stock físico (solo bebidas); None = sin tracking
    min_stock_cooler = Column(Integer, nullable=True)  # umbral alerta semáforo visicooler
    photo = Column(Text, nullable=True)           # base64
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    showcase_items = relationship("ShowcaseItem", back_populates="product")
    sale_items = relationship("SaleItem", back_populates="product")


class ShowcaseItem(Base):
    __tablename__ = "showcase_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    showcase_type = Column(String, nullable=False)  # 'entero' | 'trozado'
    status = Column(String, default="active")        # 'active' | 'sold' | 'removed' | 'sliced'
    parent_id = Column(Integer, ForeignKey("showcase_items.id"), nullable=True)
    placed_at = Column(DateTime, default=datetime.now)
    removed_at = Column(DateTime, nullable=True)
    sliced_at = Column(DateTime, nullable=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True)

    product = relationship("Product", back_populates="showcase_items")
    slices = relationship("ShowcaseItem", foreign_keys=[parent_id])


class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, autoincrement=True)
    total = Column(Float, nullable=False)
    payment_method = Column(String, nullable=False)  # 'efectivo' | 'tarjeta' | 'transferencia'
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=False)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    status = Column(String, default="completed")     # 'completed' | 'voided'
    voided_at = Column(DateTime, nullable=True)
    void_reason = Column(String, nullable=True)
    has_receipt = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)

    seller = relationship("Seller", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale")
    cash_movements = relationship("CashMovement", back_populates="sale")
    order = relationship("Order", back_populates="sales")


class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    product_name = Column(String, nullable=False)   # snapshot del nombre
    price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)
    subtotal = Column(Float, nullable=False)
    showcase_type = Column(String, nullable=True)   # 'entero' | 'trozado'

    sale = relationship("Sale", back_populates="items")
    product = relationship("Product", back_populates="sale_items")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    customer_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    delivery_date = Column(DateTime, nullable=True)
    advance = Column(Float, default=0)
    balance = Column(Float, default=0)
    status = Column(String, default="pendiente")    # 'pendiente' | 'en_produccion' | 'listo' | 'entregado'
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    items = relationship("OrderItem", back_populates="order")
    sales = relationship("Sale", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    product_name = Column(String, nullable=False)
    price = Column(Float, nullable=False)
    quantity = Column(Integer, nullable=False)
    subtotal = Column(Float, nullable=False)

    order = relationship("Order", back_populates="items")


class CashRegister(Base):
    __tablename__ = "cash_register"

    id = Column(Integer, primary_key=True, autoincrement=True)
    opened_at = Column(DateTime, default=datetime.now)
    closed_at = Column(DateTime, nullable=True)
    opening_amount = Column(Float, default=0)
    closing_amount = Column(Float, nullable=True)
    expected_amount = Column(Float, nullable=True)
    notes = Column(Text, nullable=True)
    status = Column(String, default="open")         # 'open' | 'closed'

    movements = relationship("CashMovement", back_populates="register")


class CashMovement(Base):
    __tablename__ = "cash_movements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    register_id = Column(Integer, ForeignKey("cash_register.id"), nullable=False)
    type = Column(String, nullable=False)           # 'sale' | 'expense' | 'income' | 'void'
    amount = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    register = relationship("CashRegister", back_populates="movements")
    sale = relationship("Sale", back_populates="cash_movements")


class Ingredient(Base):
    __tablename__ = "ingredients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    unit = Column(String, nullable=False)           # 'kg' | 'gr' | 'l' | 'ml' | 'unidad' | 'docena'
    current_stock = Column(Float, default=0)
    min_stock = Column(Float, default=0)
    last_price = Column(Float, default=0)
    category = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    movements = relationship("IngredientMovement", back_populates="ingredient")


class IngredientMovement(Base):
    __tablename__ = "ingredient_movements"

    id = Column(Integer, primary_key=True, autoincrement=True)
    ingredient_id = Column(Integer, ForeignKey("ingredients.id"), nullable=False)
    type = Column(String, nullable=False)           # 'purchase' | 'adjustment' | 'usage'
    quantity = Column(Float, nullable=False)
    cost = Column(Float, nullable=True)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    ingredient = relationship("Ingredient", back_populates="movements")
    seller = relationship("Seller", back_populates="ingredient_movements")


class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

    expenses = relationship("Expense", back_populates="category")


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=False)
    amount = Column(Float, nullable=False)
    description = Column(String, nullable=True)
    receipt_photo = Column(Text, nullable=True)      # base64, mismo patrón que products.photo
    document_type = Column(String, default='boleta') # 'boleta' | 'factura'
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)

    category = relationship("ExpenseCategory", back_populates="expenses")
    seller = relationship("Seller", back_populates="expenses")


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_number = Column(String, nullable=False)
    rut = Column(String, nullable=False)
    business_name = Column(String, nullable=False)
    net_amount = Column(Float, nullable=False)
    tax_amount = Column(Float, nullable=False)        # IVA 19%
    total_amount = Column(Float, nullable=False)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    sale = relationship("Sale")


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    action = Column(String, nullable=False)
    seller_id = Column(Integer, ForeignKey("sellers.id"), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    seller = relationship("Seller", back_populates="audit_logs")
