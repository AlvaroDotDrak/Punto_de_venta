from datetime import datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator


# Vocabularios compartidos. Antes cada módulo tenía el suyo (Compras aceptaba
# 'debito', Caja 'tarjeta') y nada validaba: un valor basura entraba como boleta y
# se comía el crédito fiscal del IVA sin avisar.
PaymentMethod = Literal["efectivo", "tarjeta", "debito", "transferencia"]
DocumentType = Literal["boleta", "factura"]


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
    products_access: Optional[str] = None
    can_access_insumos: Optional[bool] = None
    can_access_historial: Optional[bool] = None
    can_void_sales: Optional[bool] = None
    can_close_cash: Optional[bool] = None
    can_cash_movements: Optional[bool] = None
    can_view_costs: Optional[bool] = None
    can_view_totals: Optional[bool] = None
    can_withdraw_cash: Optional[bool] = None
    can_apply_discount: Optional[bool] = None

class SellerOut(BaseModel):
    id: int
    name: str
    role: str
    active: bool
    products_access: str
    can_access_insumos: bool
    can_access_historial: bool
    can_void_sales: bool
    can_close_cash: bool
    can_cash_movements: bool
    can_view_costs: bool
    can_view_totals: bool
    can_withdraw_cash: bool
    can_apply_discount: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    seller_id: int
    pin: str

class DevLoginRequest(BaseModel):
    pin: str

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    seller: SellerOut


# ── Products ─────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    name: str
    category: str     # según el rubro (ver verticals.py)
    price: float      # si sold_by='weight', es el precio por kg
    cost_price: Optional[float] = None
    slices: int = 8
    slice_price: Optional[float] = None  # precio por trozo; None = sin precio fijo
    max_showcase_hours: Optional[int] = 48
    sold_by: str = "unit"                # 'unit' | 'weight'
    stock: Optional[float] = None        # unidades o kg según sold_by
    min_stock_cooler: Optional[float] = None  # umbral alerta visicooler
    photo: Optional[str] = None
    barcode: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    cost_price: Optional[float] = None
    slices: Optional[int] = None
    slice_price: Optional[float] = None
    max_showcase_hours: Optional[int] = None
    sold_by: Optional[str] = None
    stock: Optional[float] = None
    min_stock_cooler: Optional[float] = None
    photo: Optional[str] = None
    barcode: Optional[str] = None
    active: Optional[bool] = None

class ProductOut(BaseModel):
    id: int
    name: str
    category: str
    price: float
    cost_price: Optional[float] = None
    cost_per_unit: Optional[float] = None
    slices: int
    slice_price: Optional[float]
    max_showcase_hours: Optional[int]
    sold_by: str = "unit"
    stock: Optional[float]
    min_stock_cooler: Optional[float]
    photo: Optional[str]
    barcode: Optional[str] = None
    active: bool
    created_at: datetime
    has_recipe: bool = False
    units_sold: int = 0

    model_config = {"from_attributes": True}


class RestockRequest(BaseModel):
    quantity: float   # unidades o kg a agregar al stock


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
    price: float = Field(ge=0)
    quantity: int = Field(gt=0)
    subtotal: float = Field(ge=0)
    showcase_type: Optional[str] = None   # 'entero' | 'trozado'
    weight: Optional[float] = None        # kg vendidos (sold_by='weight', modo 'kg')
    # Modo 'amount': la balanza ya calculó el precio y la cajera tipea ese monto.
    # Es la única cifra que el servidor no puede recalcular — ver sales.py.
    amount: Optional[float] = Field(default=None, gt=0)

class SaleCreate(BaseModel):
    total: float
    payment_method: str
    order_id: Optional[int] = None
    has_receipt: Optional[bool] = False
    # El cliente solo pide aplicar el descuento; el porcentaje lo pone el servidor
    # desde la configuración. Nunca se acepta un monto o un % del cliente.
    apply_discount: bool = False
    items: list[SaleItemIn]

class SaleItemOut(BaseModel):
    id: int
    product_id: Optional[int]
    product_name: str
    price: float
    quantity: int
    subtotal: float
    showcase_type: Optional[str]
    weight: Optional[float] = None

    model_config = {"from_attributes": True}

class SaleOut(BaseModel):
    id: int
    total: float
    subtotal: Optional[float] = None
    discount_percent: float = 0
    discount_amount: float = 0
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
    opening_amount: float = Field(ge=0)

class CashCloseRequest(BaseModel):
    closing_amount: float = Field(ge=0)
    notes: Optional[str] = None

class CashMovementCreate(BaseModel):
    type: str                          # 'income' | 'withdrawal'
    amount: float = Field(gt=0)
    description: Optional[str] = None
    payment_method: Optional[PaymentMethod] = None

class CashMovementOut(BaseModel):
    id: int
    register_id: int
    type: str
    amount: float
    description: Optional[str]
    payment_method: Optional[str]
    sale_id: Optional[int]
    expense_id: Optional[int] = None
    seller_id: Optional[int] = None
    seller_name: Optional[str] = None
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
    opened_by: Optional[str] = None
    closed_by: Optional[str] = None
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
    type: str         # 'purchase' | 'adjustment' | 'usage' | 'loss'
    quantity: float
    cost: Optional[float] = None
    notes: Optional[str] = None

    @model_validator(mode='after')
    def notes_required_for_loss(self):
        if self.type == 'loss' and not self.notes:
            raise ValueError("Las mermas requieren una nota descriptiva")
        return self

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
    ingredient_name: Optional[str] = None
    ingredient_unit: Optional[str] = None
    type: str
    quantity: float
    cost: Optional[float]
    notes: Optional[str] = None
    seller_id: Optional[int]
    sale_id: Optional[int] = None
    product_id: Optional[int] = None
    created_at: datetime
    seller: Optional[SellerOut] = None

    model_config = {"from_attributes": True}


class LossSummaryItem(BaseModel):
    ingredient_id: int
    name: str
    quantity: float
    unit: str
    total_cost: float

class LossReasonItem(BaseModel):
    notes: str
    total_cost: float
    count: int

class LossesReport(BaseModel):
    date_from: str
    date_to: str
    total_loss_cost: float
    by_ingredient: list[LossSummaryItem]
    by_reason: list[LossReasonItem]

class RestockSuggestion(BaseModel):
    ingredient_id: int
    name: str
    current_stock: float
    min_stock: float
    unit: str
    suggested_qty: float
    estimated_cost: float


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
    amount: float = Field(gt=0)
    description: Optional[str] = None
    receipt_photo: Optional[str] = None  # base64
    document_type: DocumentType = 'boleta'
    supplier_id: Optional[int] = None
    payment_method: Optional[PaymentMethod] = None

class ExpenseUpdate(BaseModel):
    category_id: Optional[int] = None
    amount: Optional[float] = Field(default=None, gt=0)
    description: Optional[str] = None
    receipt_photo: Optional[str] = None
    document_type: Optional[DocumentType] = None
    supplier_id: Optional[int] = None
    payment_method: Optional[PaymentMethod] = None

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
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    payment_method: Optional[str] = None
    has_items: bool = False
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Suppliers ─────────────────────────────────────────────────────────────────

class SupplierCreate(BaseModel):
    name: str
    rut: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    rut: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None
    active: Optional[bool] = None

class SupplierOut(BaseModel):
    id: int
    name: str
    rut: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    notes: Optional[str]
    active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Purchases (Fase 2 — factura de compra con detalle) ─────────────────────────

class PurchaseItemIn(BaseModel):
    product_id: Optional[int] = None
    ingredient_id: Optional[int] = None
    category_id: Optional[int] = None   # categoría de gasto de la línea (null → la de la factura)
    description: str
    quantity: float           # cantidad facturada (packs/cajas) — es la que cuadra con el papel
    unit_cost: float          # costo neto por unidad facturada
    units_per_pack: float = 1.0   # unidades de inventario que trae cada unidad facturada
    taxable: bool = True      # False → impuesto adicional (IABA): suma al total sin IVA

class PurchaseCreate(BaseModel):
    category_id: int
    supplier_id: Optional[int] = None
    invoice_number: Optional[str] = None   # folio del documento del proveedor
    force: bool = False                    # True → cargar aunque el folio ya exista
    document_type: DocumentType = 'factura'
    payment_method: Optional[PaymentMethod] = None
    prices_include_tax: bool = False       # True → los costos ingresados ya traen IVA (se deriva el neto)
    description: Optional[str] = None
    receipt_photo: Optional[str] = None
    items: list[PurchaseItemIn]

class PurchaseItemOut(BaseModel):
    id: int
    product_id: Optional[int]
    ingredient_id: Optional[int]
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    description: str
    quantity: float
    unit_cost: float
    line_total: float
    units_per_pack: float = 1.0
    taxable: bool = True

    model_config = {"from_attributes": True}

class PurchaseOut(BaseModel):
    id: int                    # = expense id
    invoice_number: Optional[str] = None
    category_id: int
    category_name: str
    supplier_id: Optional[int]
    supplier_name: Optional[str]
    document_type: str
    payment_method: Optional[str]
    description: Optional[str]
    net_amount: float
    tax_amount: float
    total_amount: float
    seller_name: str
    created_at: datetime
    items: list[PurchaseItemOut]

class PurchaseDeleteResult(BaseModel):
    productos_revertidos: int
    insumos_revertidos: int
    movimientos_borrados: int
    avisos: list[str] = []      # lo que no se pudo revertir del todo


class SupplierItemAliasOut(BaseModel):
    id: int
    supplier_id: int
    supplier_name: Optional[str]
    raw_description: str            # texto tal cual lo emite el proveedor
    tipo: Optional[str]             # 'product' | 'ingredient'
    item_id: Optional[int]
    item_name: Optional[str]
    item_active: bool               # False → el ítem se borró/desactivó; el alias ya no se aplica
    units_per_pack: float
    times_seen: int
    updated_at: datetime


class CostHistoryEntry(BaseModel):
    expense_id: int
    date: datetime
    supplier_name: Optional[str]
    document_type: str
    quantity: float
    unit_cost: float


# ── Escaneo de facturas con IA ────────────────────────────────────────────────

class InvoiceScanRequest(BaseModel):
    file_base64: str                 # data URI o base64 pelado (PDF/JPG/PNG/WEBP)
    filename: Optional[str] = None


class ScanMatch(BaseModel):
    tipo: Optional[str] = None       # 'product' | 'ingredient' | None
    id: Optional[int] = None
    name: Optional[str] = None
    score: float = 0.0
    status: str = 'sin_match'        # 'seguro' | 'sugerencia' | 'sin_match'
    origen: str = 'fuzzy'            # 'alias' (confirmado antes por el admin) | 'fuzzy'
    units_per_pack: float = 1.0      # del alias; 1 si nunca se confirmó


class ScanLineOut(BaseModel):
    descripcion: str
    cantidad: Optional[float] = None
    precio_unitario: Optional[float] = None
    total_linea: Optional[float] = None
    pack_sugerido: Optional[float] = None   # deducido del texto ("...X6" → 6); el admin confirma
    match: ScanMatch


class ScanChargeOut(BaseModel):
    concepto: str
    monto: Optional[float] = None
    afecto_iva: bool = True     # False → IABA/adicional; entra al form como línea sin IVA


class ScanDocumentOut(BaseModel):
    tipo_documento: Optional[str]
    proveedor: Optional[str]
    rut_proveedor: Optional[str]
    folio: Optional[str]
    fecha: Optional[str]
    neto: Optional[float]
    iva: Optional[float]
    total: Optional[float]
    supplier_id: Optional[int] = None      # match por RUT contra suppliers
    supplier_name: Optional[str] = None
    prices_include_tax: Optional[bool] = None  # inferido; None = sin evidencia
    lineas: list[ScanLineOut]
    cargos_extra: list[ScanChargeOut]
    observaciones: Optional[str]
    avisos: list[str]
    markdown: str                    # transcripción cruda del OCR (auditoría)


class InvoiceScanResponse(BaseModel):
    documentos: list[ScanDocumentOut]


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
    total_income: float          # neto cobrado (ya con los descuentos aplicados)
    total_discounts: float = 0   # pesos regalados en promociones
    total_income_gross: float = 0  # lo que se habría cobrado sin descuentos
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


# ── Product Recipes ──────────────────────────────────────────────────────────

class ProductRecipeItemIn(BaseModel):
    ingredient_id: int
    quantity: float            # Cantidad ingresada en la UI
    unit: str                  # Unidad usada en la UI ('g', 'kg', 'ml', 'l', etc.)
    yield_qty: float = 1.0

class ProductRecipeSave(BaseModel):
    items: list[ProductRecipeItemIn]

class ProductRecipeOut(BaseModel):
    id: int
    product_id: int
    ingredient_id: int
    quantity: float
    yield_qty: float
    ingredient_name: str
    ingredient_unit: str

    model_config = {"from_attributes": True}


# ── System Config ─────────────────────────────────────────────────────────────

class SystemConfigOut(BaseModel):
    key: str
    value: str

    model_config = {"from_attributes": True}


class SystemConfigUpdate(BaseModel):
    value: str


# ── Perfil de rubro (multi-vertical) ───────────────────────────────────────────

class ConfigProfileOut(BaseModel):
    business_type: str
    palette: str
    colors: dict
    available_palettes: list[dict]
    capabilities: dict[str, bool]
    branding: dict
    product_categories: list[dict]
    terminology: dict
    tax_rate: float
    setup_complete: bool
    printing: dict
    cash_diff_tolerance: float
    invoice_scan: bool = False
    discount: dict = {}
    weight_entry_mode: str = "kg"


class DiscountUpdate(BaseModel):
    enabled: Optional[bool] = None
    percent: Optional[float] = Field(default=None, ge=0, le=100)
    label: Optional[str] = None
    valid_until: Optional[str] = None   # 'YYYY-MM-DD' o '' para quitar el vencimiento


class ConfigProfileUpdate(BaseModel):
    palette: Optional[str] = None
    branding: Optional[dict] = None
    capabilities: Optional[dict] = None
    product_categories: Optional[list] = None
    tax_rate: Optional[float] = None
    cash_diff_tolerance: Optional[float] = Field(default=None, ge=0)
    discount: Optional[DiscountUpdate] = None
    weight_entry_mode: Optional[str] = None


class SetupRequest(BaseModel):
    business_type: str
    palette: Optional[str] = None
    business_name: str
    admin_pin: str
    admin_name: str = "Admin"
    branding: Optional[dict] = None



