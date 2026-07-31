import re
import unicodedata

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


def normalize_description(text: str) -> str:
    """Clave de comparación para descripciones de líneas de factura: sin acentos,
    minúsculas y con la puntuación colapsada a espacios simples. Así 'VITAL S/GAS
    6x1.6LT.' y 'Vital s/gas   6x1,6lt' caen en la misma clave.

    Es a propósito una coincidencia exacta sobre el texto normalizado: el proveedor
    emite siempre el mismo string desde su maestro de artículos, y un criterio más
    laxo acá fusionaría ítems distintos de la misma línea de productos."""
    if not text:
        return ""
    sin_acentos = ''.join(
        c for c in unicodedata.normalize('NFD', text.lower())
        if unicodedata.category(c) != 'Mn'
    )
    return re.sub(r"[^a-z0-9]+", " ", sin_acentos).strip()


_UNIDADES_MEDIDA = r"(?:LTS?|L|ML|CC|GRS?|G|KGS?|K|OZ|MT|CM)"

# El orden importa: los rótulos explícitos mandan sobre el formato "6x1.5LT".
_PATRONES_PACK = (
    # "PACK 6", "CAJA X12", "DISPLAY 24", "BANDEJA 6"
    r"(?:PACK|CAJA|DISPLAY|BANDEJA|BOLSA|ESTUCHE|SET)\s*(?:DE\s*|X\s*)?(\d{1,3})\b",
    # "6X1.5LT", "12 X 350CC" — cantidad por tamaño, el formato más común
    rf"\b(\d{{1,3}})\s*X\s*\d+(?:[.,]\d+)?\s*{_UNIDADES_MEDIDA}\b",
    # "12 UN", "6 UNID", "24 UNIDADES"
    r"\b(\d{1,3})\s*(?:UN|UND|UNID|UNIDS?|UNIDADES)\b",
    # "X6" suelto al final, sin que le siga una unidad de medida (evita "X 1.5LT")
    rf"\bX\s*(\d{{1,3}})\b(?!\s*{_UNIDADES_MEDIDA})",
)


def detect_pack(description: str):
    """Deduce cuántas unidades trae un pack a partir de la descripción de la factura
    ("COCA COLA 350CC X6" → 6). Devuelve None si no hay señal clara.

    Es solo una sugerencia para que el admin confirme: equivocarse acá desajusta el
    stock y el costo, así que ante la duda es preferible no proponer nada."""
    if not description:
        return None
    texto = unicodedata.normalize('NFD', description.upper())
    texto = ''.join(c for c in texto if unicodedata.category(c) != 'Mn')

    for patron in _PATRONES_PACK:
        m = re.search(patron, texto)
        if m:
            valor = int(m.group(1))
            # Fuera de este rango casi siempre es un gramaje o un código, no un pack.
            if 2 <= valor <= 48:
                return float(valor)
    return None


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


def compute_cost_per_unit(product, showcase_type: str | None = None) -> float | None:
    """
    Calcula el costo unitario de un producto.
    - Con receta: suma (last_price × quantity) de ingredientes / yield_qty
    - Sin receta: usa cost_price directo
    - showcase_type='trozado': divide el costo base entre product.slices
    """
    if product.recipes:
        ingredient_cost = sum(
            r.ingredient.last_price * r.quantity
            for r in product.recipes if r.ingredient and r.ingredient.last_price
        )
        yield_qty = product.recipes[0].yield_qty if product.recipes else None
        if not yield_qty or yield_qty <= 0:
            return None
        base_cost = ingredient_cost / yield_qty
        if showcase_type == "trozado" and product.slices and product.slices > 0:
            return round(base_cost / product.slices, 2)
        return round(base_cost, 2)
    if product.cost_price is not None:
        return product.cost_price
    return None
