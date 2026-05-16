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
    category: str     # 'vitrina' | 'salados' | 'encargo' | 'bebidas' | 'cafe'
    price: float
    slices: int = 8
    slice_price: Optional[float] = None  # precio por trozo; None = sin precio fijo
    max_showcase_hours: Optional[int] = 48
    stock: Optional[int] = None          # solo para bebidas
    min_stock_cooler: Optional[int] = None  # umbral alerta visicooler
    photo: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    slices: Optional[int] = None
    slice_price: Optional[float] = None
    max_showcase_hours: Optional[int] = None
    stock: Optional[int] = None
    min_stock_cooler: Optional[int] = None
    photo: Optional[str] = None
    active: Optional[bool] = None

class ProductOut(BaseModel):
    id: int
    name: str
    category: str
    price: float
    slices: int
    slice_price: Optional[float]
    max_showcase_hours: Optional[int]
    stock: Optional[int]
    min_stock_cooler: Optional[int]
    photo: Optional[str]
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RestockRequest(BaseModel):
    quantity: int   # unidades a agregar al stock


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
    has_receipt: Optional[bool] = False
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
    has_receipt: bool = False
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

class OrderCompleteRequest(BaseModel):
    payment_method: str   # 'efectivo' | 'tarjeta' | 'transferencia'

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
    notes: Optional[str] = None

class CashMovementCreate(BaseModel):
    type: str                          # 'expense' | 'income'
    amount: float
    description: Optional[str] = None
    payment_method: Optional[str] = None  # 'efectivo' | 'tarjeta' | 'transferencia'

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
    notes: Optional[str]
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

class IngredientMovementOut(BaseModel):
    id: int
    ingredient_id: int
    type: str
    quantity: float
    cost: Optional[float]
    seller_id: Optional[int]
    created_at: datetime
    seller: Optional[SellerOut] = None

    model_config = {"from_attributes": True}


# ── Expense Categories ────────────────────────────────────────────────────────

class ExpenseCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ExpenseCategoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None

class ExpenseCategoryOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Expenses ──────────────────────────────────────────────────────────────────

class ExpenseCreate(BaseModel):
    category_id: int
    amount: float
    description: Optional[str] = None
    receipt_photo: Optional[str] = None  # base64
    document_type: str = 'boleta'        # 'boleta' | 'factura'

class ExpenseUpdate(BaseModel):
    category_id: Optional[int] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    receipt_photo: Optional[str] = None
    document_type: Optional[str] = None

class ExpenseOut(BaseModel):
    id: int
    category_id: int
    category_name: str
    amount: float
    description: Optional[str]
    receipt_photo: Optional[str]
    document_type: str
    seller_id: int
    seller_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Invoices ──────────────────────────────────────────────────────────────────

class InvoiceCreate(BaseModel):
    invoice_number: str
    rut: str
    business_name: str
    net_amount: float
    tax_amount: Optional[float] = None      # si None, se calcula como net_amount * 0.19
    total_amount: Optional[float] = None    # si None, se calcula como net + tax
    sale_id: Optional[int] = None
    description: Optional[str] = None

class InvoiceOut(BaseModel):
    id: int
    invoice_number: str
    rut: str
    business_name: str
    net_amount: float
    tax_amount: float
    total_amount: float
    sale_id: Optional[int]
    description: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Accounting Summary ────────────────────────────────────────────────────────

class ExpenseSummaryItem(BaseModel):
    category_name: str
    total: float
    count: int

class IncomeSummaryItem(BaseModel):
    category_name: str
    total: float
    count: int   # unidades vendidas (sum de quantities)

class AccountingSummary(BaseModel):
    date_from: str
    date_to: str
    total_income: float
    total_income_cash: float
    total_income_card: float
    total_income_transfer: float
    total_expenses: float
    net_profit: float
    sales_count: int
    sales_with_receipt: int
    sales_without_receipt: int
    expenses_by_category: list[ExpenseSummaryItem]
    invoices_count: int
    invoices_total: float
    # IVA estimado (fórmula extracción 19/119 — precios incluyen IVA)
    vat_debit: float
    vat_credit: float
    vat_balance: float
    income_by_category: list[IncomeSummaryItem]


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLogOut(BaseModel):
    id: int
    action: str
    seller_id: Optional[int]
    details: Optional[str]
    created_at: datetime
    seller: Optional[SellerOut] = None

    model_config = {"from_attributes": True}
