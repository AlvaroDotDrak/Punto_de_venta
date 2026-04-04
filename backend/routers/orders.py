from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Order, OrderItem
from ..auth import get_current_seller
from ..audit import ACTIONS, log_action
from ..schemas import OrderCreate, OrderOut, OrderUpdate

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderOut])
def list_orders(
    status: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_seller),
):
    q = db.query(Order).options(joinedload(Order.items))
    if status:
        q = q.filter(Order.status == status)
    return q.order_by(Order.delivery_date.asc()).all()


@router.post("", response_model=OrderOut, status_code=201)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    order = Order(
        customer_name=payload.customer_name,
        phone=payload.phone,
        description=payload.description,
        delivery_date=payload.delivery_date,
        advance=payload.advance,
        balance=payload.balance,
    )
    db.add(order)
    db.flush()

    for item_in in payload.items:
        db.add(OrderItem(
            order_id=order.id,
            product_id=item_in.product_id,
            product_name=item_in.product_name,
            price=item_in.price,
            quantity=item_in.quantity,
            subtotal=item_in.subtotal,
        ))

    db.commit()
    db.refresh(order)
    log_action(db, ACTIONS.ORDER_CREATE, seller.id, f"Pedido para {payload.customer_name}")

    return db.query(Order).options(joinedload(Order.items)).filter(Order.id == order.id).first()


@router.patch("/{order_id}", response_model=OrderOut)
def update_order(
    order_id: int,
    payload: OrderUpdate,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(order, field, value)
    order.updated_at = datetime.utcnow()

    db.commit()
    log_action(db, ACTIONS.ORDER_UPDATE, seller.id,
               f"Pedido #{order_id} → {payload.status or 'actualizado'}")

    return db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db), _=Depends(get_current_seller)):
    order = db.query(Order).options(joinedload(Order.items)).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Pedido no encontrado")
    return order
