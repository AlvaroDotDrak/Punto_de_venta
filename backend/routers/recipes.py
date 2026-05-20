from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Product, Ingredient, ProductRecipe
from ..auth import require_admin
from ..audit import ACTIONS, log_action
from ..schemas import ProductRecipeSave, ProductRecipeOut

router = APIRouter(prefix="/products", tags=["recipes"])

CONVERSION_FACTORS = {
    # Masa/Peso
    ("kg", "g"): 1000.0,
    ("g", "kg"): 0.001,
    # Volumen
    ("l", "ml"): 1000.0,
    ("ml", "l"): 0.001,
    # Unidades
    ("docena", "unidad"): 12.0,
    ("unidad", "docena"): 1.0 / 12.0,
}

def convert_unit(value: float, from_unit: str, to_unit: str) -> float:
    from_unit = from_unit.lower().strip()
    to_unit = to_unit.lower().strip()
    
    # Mapeo amistoso de abreviaciones comunes
    map_units = {
        "gr": "g",
        "grs": "g",
        "gramos": "g",
        "kilo": "kg",
        "kilos": "kg",
        "kg": "kg",
        "litro": "l",
        "litros": "l",
        "l": "l",
        "ml": "ml",
        "cc": "ml",
        "unid": "unidad",
        "unidades": "unidad",
        "unidad": "unidad",
        "docena": "docena",
        "docenas": "docena",
    }
    
    from_unit = map_units.get(from_unit, from_unit)
    to_unit = map_units.get(to_unit, to_unit)
    
    if from_unit == to_unit:
        return value
        
    pair = (from_unit, to_unit)
    if pair in CONVERSION_FACTORS:
        return value * CONVERSION_FACTORS[pair]
        
    raise ValueError(f"Unidades incompatibles: no se puede convertir de '{from_unit}' a '{to_unit}'")


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
