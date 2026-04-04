from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Ingredient, IngredientMovement
from ..auth import get_current_seller, require_admin
from ..audit import ACTIONS, log_action
from ..schemas import IngredientCreate, IngredientMovementCreate, IngredientOut, IngredientUpdate

router = APIRouter(prefix="/ingredients", tags=["ingredients"])


@router.get("", response_model=list[IngredientOut])
def list_ingredients(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(Ingredient).filter(Ingredient.active == True).order_by(Ingredient.name).all()


@router.post("", response_model=IngredientOut, status_code=201)
def create_ingredient(
    payload: IngredientCreate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    ingredient = Ingredient(**payload.model_dump())
    db.add(ingredient)
    db.commit()
    db.refresh(ingredient)
    log_action(db, ACTIONS.INGREDIENT_CREATE, admin.id, f"Insumo creado: {ingredient.name}")
    return ingredient


@router.patch("/{ingredient_id}", response_model=IngredientOut)
def update_ingredient(
    ingredient_id: int,
    payload: IngredientUpdate,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if not ingredient:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(ingredient, field, value)

    db.commit()
    db.refresh(ingredient)
    return ingredient


@router.post("/{ingredient_id}/movements", status_code=201)
def add_movement(
    ingredient_id: int,
    payload: IngredientMovementCreate,
    db: Session = Depends(get_db),
    seller=Depends(get_current_seller),
):
    ingredient = db.query(Ingredient).filter(Ingredient.id == ingredient_id).first()
    if not ingredient:
        raise HTTPException(status_code=404, detail="Insumo no encontrado")

    movement = IngredientMovement(
        ingredient_id=ingredient_id,
        type=payload.type,
        quantity=payload.quantity,
        cost=payload.cost,
        seller_id=seller.id,
    )
    db.add(movement)

    # Actualizar stock
    if payload.type in ("purchase", "adjustment"):
        ingredient.current_stock += payload.quantity
        if payload.cost:
            ingredient.last_price = payload.cost / payload.quantity
    elif payload.type == "usage":
        ingredient.current_stock -= payload.quantity

    db.commit()
    log_action(db, ACTIONS.INGREDIENT_MOVEMENT, seller.id,
               f"Insumo {ingredient.name}: {payload.type} {payload.quantity}{ingredient.unit}")
    return {"ok": True}
