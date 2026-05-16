from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Invoice, Sale
from ..auth import require_admin
from ..audit import ACTIONS, log_action
from ..schemas import InvoiceCreate, InvoiceOut

router = APIRouter(tags=["invoices"])


@router.get("/invoices", response_model=list[InvoiceOut])
def list_invoices(
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = db.query(Invoice)
    if date_from:
        q = q.filter(Invoice.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(Invoice.created_at <= datetime.fromisoformat(date_to + "T23:59:59"))
    return q.order_by(Invoice.created_at.desc()).offset(offset).limit(limit).all()


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
def create_invoice(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    existing = db.query(Invoice).filter(Invoice.invoice_number == payload.invoice_number).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Ya existe una factura con el número {payload.invoice_number}")

    if payload.sale_id:
        sale = db.query(Sale).filter(
            Sale.id == payload.sale_id, Sale.status == "completed"
        ).first()
        if not sale:
            raise HTTPException(status_code=404, detail="Venta no encontrada o no está completada")

    tax_amount = (
        payload.tax_amount
        if payload.tax_amount is not None
        else round(payload.net_amount * 0.19, 2)
    )
    total_amount = (
        payload.total_amount
        if payload.total_amount is not None
        else round(payload.net_amount + tax_amount, 2)
    )

    invoice = Invoice(
        invoice_number=payload.invoice_number,
        rut=payload.rut,
        business_name=payload.business_name,
        net_amount=payload.net_amount,
        tax_amount=tax_amount,
        total_amount=total_amount,
        sale_id=payload.sale_id,
        description=payload.description,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    log_action(db, ACTIONS.INVOICE_CREATED, admin.id,
               f"Factura {payload.invoice_number} a {payload.business_name} por ${total_amount:.0f}")
    return invoice


@router.get("/invoices/{invoice_id}", response_model=InvoiceOut)
def get_invoice(invoice_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    return invoice
