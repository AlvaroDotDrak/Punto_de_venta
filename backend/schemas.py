from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# ── Sellers ──────────────────────────────────────────────────────────────────

class SellerCreate(BaseModel):
    name: str
    pin: str          # PIN en texto plano → se hashea en el endpoint
    role: str = "seller"

class SellerUpdate(BaseModel):
    name: Optional[str] = None
    pin: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None

class SellerOut(BaseModel):
    id: int
    name: str
    role: str
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    seller_id: int
    pin: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    seller: SellerOut


# ── Products ─────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str
    category: str     # 'vitrina' | 'salados' | 'encargo'
    price: float
    slices: int = 8
    max_showcase_hours: int = 48
    photo: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    slices: Optional[int] = None
    max_showcase_hours: Optional[int] = None
    photo: Optional[str] = None
    active: Optional[bool] = None

class ProductOut(BaseModel):
    id: int
    name: str
    category: str
    price: float
    slices: int
    max_showcase_hours: int
    photo: Optional[str]
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Showcase ──────────────────────────────────────────────────────────────────

class ShowcaseItemCreate(BaseModel):
    product_id: int
    showcase_type: str    # 'entero' | 'trozado'

class ShowcaseItemOut(BaseModel):
    id: int
    product_id: int
    showcase_type: str
    status: str
    parent_id: Optional[int]
    placed_at: datetime
    removed_at: Optional[datetime]
    sliced_at: Optional[datetime]
    sale_id: Optional[int]
    product: Optional[ProductOut] = None

    model_config = {"from_attributes": True}


# ── Sales ─────────────────────────────────────────────────────────────────────

class SaleItemIn(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    price: float
    quantity: int
    subtotal: float
    showcase_type: Optional[str] = None   # 'entero' | 'trozado'

class SaleCreate(BaseModel):
    total: float
    payment_method: str
    order_id: Optional[int] = None
    items: list[SaleItemIn]

class SaleItemOut(BaseModel):
    id: int
    product_id: Optional[int]
    product_name: str
    price: float
    quantity: int
    subtotal: float
    showcase_type: Optional[str]

    model_config = {"from_attributes": True}

class SaleOut(BaseModel):
    id: int
    total: float
    payment_method: str
    seller_id: int
    order_id: Optional[int]
    status: str
    voided_at: Optional[datetime]
    void_reason: Optional[str]
    created_at: datetime
    items: list[SaleItemOut] = []
    seller: Optional[SellerOut] = None

    model_config = {"from_attributes": True}

class VoidSaleRequest(BaseModel):
    reason: str       # mínimo 10 caracteres


# ── Orders ────────────────────────────────────────────────────────────────────

class OrderItemIn(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    price: float
    quantity: int
    subtotal: float

class OrderCreate(BaseModel):
    customer_name: str
    phone: Optional[str] = None
    description: Optional[str] = None
    delivery_date: Optional[datetime] = None
    advance: float = 0
    balance: float = 0
    items: list[OrderItemIn] = []

class OrderUpdate(BaseModel):
    customer_name: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    delivery_date: Optional[datetime] = None
    advance: Optional[float] = None
    balance: Optional[float] = None
    status: Optional[str] = None

class OrderItemOut(BaseModel):
    id: int
    product_id: Optional[int]
    product_name: str
    price: float
    quantity: int
    subtotal: float

    model_config = {"from_attributes": True}

class OrderOut(BaseModel):
    id: int
    customer_name: str
    phone: Optional[str]
    description: Optional[str]
    delivery_date: Optional[datetime]
    advance: float
    balance: float
    status: str
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemOut] = []

    model_config = {"from_attributes": True}


# ── Cash Register ─────────────────────────────────────────────────────────────

class CashOpenRequest(BaseModel):
    opening_amount: float

class CashCloseRequest(BaseModel):
    closing_amount: float

class CashMovementCreate(BaseModel):
    type: str         # 'expense' | 'income'
    amount: float
    description: Optional[str] = None

class CashMovementOut(BaseModel):
    id: int
    register_id: int
    type: str
    amount: float
    description: Optional[str]
    payment_method: Optional[str]
    sale_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}

class CashRegisterOut(BaseModel):
    id: int
    opened_at: datetime
    closed_at: Optional[datetime]
    opening_amount: float
    closing_amount: Optional[float]
    expected_amount: Optional[float]
    status: str
    movements: list[CashMovementOut] = []

    model_config = {"from_attributes": True}


# ── Ingredients ───────────────────────────────────────────────────────────────

class IngredientCreate(BaseModel):
    name: str
    unit: str
    current_stock: float = 0
    min_stock: float = 0
    last_price: float = 0
    category: Optional[str] = None

class IngredientUpdate(BaseModel):
    name: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[float] = None
    min_stock: Optional[float] = None
    last_price: Optional[float] = None
    category: Optional[str] = None
    active: Optional[bool] = None

class IngredientMovementCreate(BaseModel):
    type: str         # 'purchase' | 'adjustment' | 'usage'
    quantity: float
    cost: Optional[float] = None

class IngredientOut(BaseModel):
    id: int
    name: str
    unit: str
    current_stock: float
    min_stock: float
    last_price: float
    category: Optional[str]
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    action: str
    seller_id: Optional[int]
    details: Optional[str]
    created_at: datetime
    seller: Optional[SellerOut] = None

    model_config = {"from_attributes": True}
