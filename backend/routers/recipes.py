from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Product, Ingredient, ProductRecipe
from ..auth import require_admin
from ..audit import ACTIONS, log_action
from ..schemas import ProductRecipeSave, ProductRecipeOut
from ..utils import convert_unit

router = APIRouter(prefix="/products", tags=["recipes"])



@router.get("/{product_id}/recipe", response_model=list[ProductRecipeOut])
def get_recipe(
    product_id: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id, Product.active == True).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
        
    return (
        db.query(ProductRecipe)
        .options(joinedload(ProductRecipe.ingredient))
        .filter(ProductRecipe.product_id == product_id)
        .all()
    )


@router.post("/{product_id}/recipe", response_model=list[ProductRecipeOut])
def save_recipe(
    product_id: int,
    payload: ProductRecipeSave,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    product = db.query(Product).filter(Product.id == product_id, Product.active == True).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    # Consolidar ingredientes duplicados y aplicar conversión de unidades
    consolidated = {}
    for item in payload.items:
        ingredient = db.query(Ingredient).filter(Ingredient.id == item.ingredient_id, Ingredient.active == True).first()
        if not ingredient:
            raise HTTPException(
                status_code=404, 
                detail=f"Insumo ID {item.ingredient_id} no encontrado o inactivo"
            )
            
        try:
            final_qty = convert_unit(item.quantity, item.unit, ingredient.unit)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
            
        if item.ingredient_id in consolidated:
            # Consolidar sumando la cantidad
            consolidated[item.ingredient_id].quantity += final_qty
        else:
            # Crear nueva relación temporal
            consolidated[item.ingredient_id] = ProductRecipe(
                product_id=product_id,
                ingredient_id=item.ingredient_id,
                quantity=final_qty,
                yield_qty=item.yield_qty
            )

    # Eliminar receta antigua
    db.query(ProductRecipe).filter(ProductRecipe.product_id == product_id).delete()
    
    # Agregar nueva receta consolidada
    for recipe_item in consolidated.values():
        db.add(recipe_item)
        
    db.commit()
    log_action(db, ACTIONS.RECIPE_UPDATE, admin.id, f"Receta actualizada para producto {product.name} (ID {product_id})")
    
    return (
        db.query(ProductRecipe)
        .options(joinedload(ProductRecipe.ingredient))
        .filter(ProductRecipe.product_id == product_id)
        .all()
    )
