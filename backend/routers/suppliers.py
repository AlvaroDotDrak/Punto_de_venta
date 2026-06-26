from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Supplier
from ..auth import get_current_seller, require_admin
from ..audit import ACTIONS, log_action
from ..schemas import SupplierCreate, SupplierOut, SupplierUpdate

router = APIRouter(tags=["suppliers"])


@router.get("/suppliers", response_model=list[SupplierOut])
def list_suppliers(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    q = db.query(Supplier)
    if not include_inactive:
        q = q.filter(Supplier.active == True)
    return q.order_by(Supplier.name).all()


@router.post("/suppliers", response_model=SupplierOut, status_code=201)
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    log_action(db, ACTIONS.SUPPLIER_CREATED, admin.id, f"Proveedor creado: {supplier.name}")
    return supplier


@router.patch("/suppliers/{supplier_id}", response_model=SupplierOut)
def update_supplier(
    supplier_id: int,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Proveedor no encontrado")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(supplier, field, value)
    db.commit()
    db.refresh(supplier)
    log_action(db, ACTIONS.SUPPLIER_UPDATED, admin.id, f"Proveedor actualizado: {supplier.name}")
    return supplier
