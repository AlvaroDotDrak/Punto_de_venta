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


def calculate_vat(amount: float) -> float:
    return amount * 19 / 119


def calculate_suggested_restock(current_stock: float, min_stock: float) -> float:
    if current_stock < min_stock:
        return (min_stock * 2) - current_stock
    return 0.0


def calculate_recipe_fraction(quantity: float, showcase_type: str | None, slices_count: int | None) -> float:
    if showcase_type == "trozado":
        slices = slices_count if (slices_count and slices_count > 0) else 8
        return quantity / slices
    return quantity


def calculate_loss_valuation(quantity: float, last_price: float) -> float:
    return quantity * last_price
