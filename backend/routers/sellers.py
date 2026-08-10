from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Seller
from ..auth import hash_pin, require_admin
from ..audit import ACTIONS, log_action
from ..schemas import SellerCreate, SellerOut, SellerUpdate

router = APIRouter(prefix="/sellers", tags=["sellers"])


@router.get("", response_model=list[SellerOut])
def list_sellers(db: Session = Depends(get_db), requester=Depends(require_admin)):
    q = db.query(Seller)
    # Un admin del cliente no ve la cuenta dev (proveedor); un dev sí.
    if requester.role != "dev":
        q = q.filter(Seller.role != "dev")
    return q.all()


@router.post("", response_model=SellerOut, status_code=201)
def create_seller(payload: SellerCreate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    # Solo un dev puede crear otra cuenta dev.
    if payload.role == "dev" and admin.role != "dev":
        raise HTTPException(status_code=403, detail="No autorizado")
    seller = Seller(
        name=payload.name,
        pin=hash_pin(payload.pin),
        role=payload.role,
    )
    db.add(seller)
    db.commit()
    db.refresh(seller)
    log_action(db, ACTIONS.SELLER_CREATE, admin.id, f"Vendedor creado: {seller.name}")
    return seller


@router.patch("/{seller_id}", response_model=SellerOut)
def update_seller(
    seller_id: int,
    payload: SellerUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    seller = db.query(Seller).filter(Seller.id == seller_id).first()
    if not seller:
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")

    # La cuenta dev solo la gestiona un dev; al admin se le oculta su existencia.
    if seller.role == "dev" and admin.role != "dev":
        raise HTTPException(status_code=404, detail="Vendedor no encontrado")
    if payload.role == "dev" and admin.role != "dev":
        raise HTTPException(status_code=403, detail="No autorizado")

    if payload.name is not None:
        seller.name = payload.name
    if payload.pin is not None:
        seller.pin = hash_pin(payload.pin)
    if payload.role is not None and payload.role != seller.role:
        # La UI solo ofrece seller/admin, así que editar una cuenta dev para
        # cambiarle otra cosa mandaba role='admin' y la degradaba en silencio:
        # se perdía el login oculto y la cuenta quedaba visible en la pantalla
        # de login del cliente. Degradar un dev tiene que ser explícito.
        if seller.role == "dev" and payload.role != "dev" and not payload.demote_dev:
            raise HTTPException(
                status_code=400,
                detail="Para quitarle el rol de soporte a esta cuenta hay que confirmarlo explícitamente",
            )
        seller.role = payload.role
    if payload.active is not None:
        seller.active = payload.active
    if payload.products_access is not None:
        seller.products_access = payload.products_access
    if payload.can_access_insumos is not None:
        seller.can_access_insumos = payload.can_access_insumos
    if payload.can_access_historial is not None:
        seller.can_access_historial = payload.can_access_historial
    if payload.can_void_sales is not None:
        seller.can_void_sales = payload.can_void_sales
    if payload.can_close_cash is not None:
        seller.can_close_cash = payload.can_close_cash
    if payload.can_cash_movements is not None:
        seller.can_cash_movements = payload.can_cash_movements
    if payload.can_view_costs is not None:
        seller.can_view_costs = payload.can_view_costs
    if payload.can_view_totals is not None:
        seller.can_view_totals = payload.can_view_totals
    if payload.can_withdraw_cash is not None:
        seller.can_withdraw_cash = payload.can_withdraw_cash
    if payload.can_apply_discount is not None:
        seller.can_apply_discount = payload.can_apply_discount
    if payload.can_give_courtesy is not None:
        seller.can_give_courtesy = payload.can_give_courtesy
    if payload.can_manage_expenses is not None:
        seller.can_manage_expenses = payload.can_manage_expenses
    if payload.can_view_expense_history is not None:
        seller.can_view_expense_history = payload.can_view_expense_history

    db.commit()
    db.refresh(seller)
    log_action(db, ACTIONS.SELLER_UPDATE, admin.id, f"Vendedor actualizado: {seller.name}")
    return seller
