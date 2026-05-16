import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Expense, ExpenseCategory, Invoice, Sale, SaleItem, Seller
from ..auth import require_admin
from ..audit import ACTIONS, log_action
from ..schemas import AccountingSummary, ExpenseSummaryItem, IncomeSummaryItem

router = APIRouter(prefix="/accounting", tags=["accounting"])

# Tasa de extracción de IVA: los precios en el POS ya incluyen IVA.
# IVA contenido = total × 19/119  (≠ total × 0.19)
_VAT_RATE = 19 / 119

MONTH_NAMES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

# Nombres para mostrar en reportes
_CAT_LABELS = {
    "vitrina": "Vitrina",
    "salados": "Salados",
    "bebidas": "Bebidas",
    "cafe": "Café",
    "encargo": "Encargos",
}


@router.get("/summary", response_model=AccountingSummary)
def get_summary(
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    dt_from = datetime.fromisoformat(date_from)
    dt_to = datetime.fromisoformat(date_to + "T23:59:59")

    # ── Ventas ───────────────────────────────────────────────────────────────
    sales = db.query(Sale).filter(
        Sale.status == "completed",
        Sale.created_at >= dt_from,
        Sale.created_at <= dt_to,
    ).all()

    total_income = sum(s.total for s in sales)
    total_income_cash = sum(s.total for s in sales if s.payment_method == "efectivo")
    total_income_card = sum(s.total for s in sales if s.payment_method == "tarjeta")
    total_income_transfer = sum(s.total for s in sales if s.payment_method == "transferencia")
    sales_count = len(sales)
    sales_with_receipt = sum(1 for s in sales if s.has_receipt)

    # ── Gastos ───────────────────────────────────────────────────────────────
    expenses = db.query(Expense).filter(
        Expense.created_at >= dt_from,
        Expense.created_at <= dt_to,
    ).all()
    total_expenses = sum(e.amount for e in expenses)

    cat_map: dict[str, dict] = {}
    cat_names: dict[int, str] = {}
    for e in expenses:
        if e.category_id not in cat_names:
            cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == e.category_id).first()
            cat_names[e.category_id] = cat.name if cat else "Sin categoría"
        name = cat_names[e.category_id]
        if name not in cat_map:
            cat_map[name] = {"total": 0.0, "count": 0}
        cat_map[name]["total"] += e.amount
        cat_map[name]["count"] += 1

    expenses_by_category = [
        ExpenseSummaryItem(category_name=name, total=v["total"], count=v["count"])
        for name, v in sorted(cat_map.items(), key=lambda x: x[1]["total"], reverse=True)
    ]

    # ── Facturas emitidas ─────────────────────────────────────────────────────
    invoices = db.query(Invoice).filter(
        Invoice.created_at >= dt_from,
        Invoice.created_at <= dt_to,
    ).all()
    invoices_tax_total = sum(i.tax_amount for i in invoices)

    # ── IVA estimado (extracción 19/119 — precios incluyen IVA) ──────────────
    # Débito Fiscal: IVA cobrado en ventas con boleta + IVA de facturas emitidas
    sales_with_receipt_total = sum(s.total for s in sales if s.has_receipt)
    vat_debit = sales_with_receipt_total * _VAT_RATE + invoices_tax_total

    # Crédito Fiscal: IVA en compras donde el proveedor emitió factura
    expenses_factura_total = sum(e.amount for e in expenses if (e.document_type or 'boleta') == 'factura')
    vat_credit = expenses_factura_total * _VAT_RATE

    vat_balance = vat_debit - vat_credit

    # ── Ingresos por categoría de producto ───────────────────────────────────
    sale_items = (
        db.query(SaleItem)
        .join(Sale, SaleItem.sale_id == Sale.id)
        .filter(
            Sale.status == "completed",
            Sale.created_at >= dt_from,
            Sale.created_at <= dt_to,
        )
        .options(joinedload(SaleItem.product))
        .all()
    )

    income_cat: dict[str, dict] = {}
    for item in sale_items:
        raw_cat = item.product.category if item.product else "Sin categoría"
        label = _CAT_LABELS.get(raw_cat, raw_cat.capitalize())
        if label not in income_cat:
            income_cat[label] = {"total": 0.0, "count": 0}
        income_cat[label]["total"] += item.subtotal
        income_cat[label]["count"] += item.quantity

    income_by_category = [
        IncomeSummaryItem(category_name=name, total=v["total"], count=v["count"])
        for name, v in sorted(income_cat.items(), key=lambda x: x[1]["total"], reverse=True)
    ]

    return AccountingSummary(
        date_from=date_from,
        date_to=date_to,
        total_income=total_income,
        total_income_cash=total_income_cash,
        total_income_card=total_income_card,
        total_income_transfer=total_income_transfer,
        total_expenses=total_expenses,
        net_profit=total_income - total_expenses,
        sales_count=sales_count,
        sales_with_receipt=sales_with_receipt,
        sales_without_receipt=sales_count - sales_with_receipt,
        expenses_by_category=expenses_by_category,
        invoices_count=len(invoices),
        invoices_total=sum(i.total_amount for i in invoices),
        vat_debit=vat_debit,
        vat_credit=vat_credit,
        vat_balance=vat_balance,
        income_by_category=income_by_category,
    )


@router.get("/export")
def export_report(
    date_from: str = Query(...),
    date_to: str = Query(...),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment

    dt_from = datetime.fromisoformat(date_from)
    dt_to = datetime.fromisoformat(date_to + "T23:59:59")

    sales = db.query(Sale).filter(
        Sale.status == "completed",
        Sale.created_at >= dt_from,
        Sale.created_at <= dt_to,
    ).all()
    expenses = db.query(Expense).filter(
        Expense.created_at >= dt_from,
        Expense.created_at <= dt_to,
    ).all()
    invoices = db.query(Invoice).filter(
        Invoice.created_at >= dt_from,
        Invoice.created_at <= dt_to,
    ).all()

    total_income = sum(s.total for s in sales)
    total_expenses = sum(e.amount for e in expenses)
    period_label = f"{date_from} al {date_to}"

    sales_with_receipt_total = sum(s.total for s in sales if s.has_receipt)
    invoices_tax_total = sum(i.tax_amount for i in invoices)
    vat_debit = sales_with_receipt_total * _VAT_RATE + invoices_tax_total
    vat_credit = sum(e.amount for e in expenses if (e.document_type or 'boleta') == 'factura') * _VAT_RATE
    vat_balance = vat_debit - vat_credit

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="BF5A2F")

    def style_header_row(ws):
        for cell in ws[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")

    wb = openpyxl.Workbook()

    # ── Hoja 1: Resumen ───────────────────────────────────────────────────────
    ws1 = wb.active
    ws1.title = "Resumen"
    ws1.append(["Período", "Total Ingresos", "Total Gastos", "Utilidad Neta",
                "Ventas c/boleta", "Ventas s/boleta",
                "Débito Fiscal IVA", "Crédito Fiscal IVA", "IVA Estimado a Pagar"])
    style_header_row(ws1)
    ws1.append([
        period_label,
        total_income,
        total_expenses,
        total_income - total_expenses,
        sum(1 for s in sales if s.has_receipt),
        sum(1 for s in sales if not s.has_receipt),
        round(vat_debit),
        round(vat_credit),
        round(vat_balance),
    ])
    for col, width in [("A", 22), ("B", 16), ("C", 14), ("D", 14),
                       ("E", 15), ("F", 15), ("G", 18), ("H", 18), ("I", 20)]:
        ws1.column_dimensions[col].width = width

    # ── Hoja 2: Detalle Ventas ────────────────────────────────────────────────
    ws2 = wb.create_sheet("Detalle Ventas")
    ws2.append(["Fecha", "Monto", "Método Pago", "Con Boleta", "Vendedor", "Estado"])
    style_header_row(ws2)

    seller_cache: dict[int, str] = {}
    for s in sorted(sales, key=lambda x: x.created_at):
        if s.seller_id not in seller_cache:
            sel = db.query(Seller).filter(Seller.id == s.seller_id).first()
            seller_cache[s.seller_id] = sel.name if sel else "Desconocido"
        ws2.append([
            s.created_at.strftime("%d/%m/%Y %H:%M"),
            s.total,
            s.payment_method,
            "Sí" if s.has_receipt else "No",
            seller_cache[s.seller_id],
            s.status,
        ])
    for col, width in [("A", 18), ("B", 12), ("C", 16), ("D", 12), ("E", 18), ("F", 12)]:
        ws2.column_dimensions[col].width = width

    # ── Hoja 3: Detalle Gastos ────────────────────────────────────────────────
    ws3 = wb.create_sheet("Detalle Gastos")
    ws3.append(["Fecha", "Monto", "Tipo Doc.", "Categoría", "Descripción", "Registrado por"])
    style_header_row(ws3)

    cat_cache: dict[int, str] = {}
    for e in sorted(expenses, key=lambda x: x.created_at):
        if e.category_id not in cat_cache:
            cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == e.category_id).first()
            cat_cache[e.category_id] = cat.name if cat else "Sin categoría"
        if e.seller_id not in seller_cache:
            sel = db.query(Seller).filter(Seller.id == e.seller_id).first()
            seller_cache[e.seller_id] = sel.name if sel else "Desconocido"
        ws3.append([
            e.created_at.strftime("%d/%m/%Y %H:%M"),
            e.amount,
            (e.document_type or 'boleta').capitalize(),
            cat_cache[e.category_id],
            e.description or "",
            seller_cache[e.seller_id],
        ])
    for col, width in [("A", 18), ("B", 12), ("C", 12), ("D", 18), ("E", 30), ("F", 18)]:
        ws3.column_dimensions[col].width = width

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    log_action(db, ACTIONS.ACCOUNTING_EXPORT, admin.id, f"Exportación contable {period_label}")

    filename = f"reporte_contable_{date_from}_{date_to}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
