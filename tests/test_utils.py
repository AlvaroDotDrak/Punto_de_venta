import pytest
from backend.utils import (
    convert_unit,
    calculate_vat,
    calculate_suggested_restock,
    calculate_recipe_fraction,
    calculate_loss_valuation
)


def test_convert_unit_success():
    # Masa/Peso
    assert convert_unit(1.5, "kg", "g") == 1500.0
    assert convert_unit(500, "g", "kg") == 0.5
    # Volumen
    assert convert_unit(2.0, "l", "ml") == 2000.0
    assert convert_unit(250, "ml", "l") == 0.25
    # Unidades
    assert convert_unit(2.0, "docena", "unidad") == 24.0
    assert convert_unit(6, "unidad", "docena") == 0.5
    # Mapeo amistoso e insensitive
    assert convert_unit(1000, "GRS", "KilOS") == 1.0
    assert convert_unit(3, "litros", "ml") == 3000.0
    assert convert_unit(12, "unidades", "docena") == 1.0


def test_convert_unit_same():
    assert convert_unit(10, "kg", "kg") == 10
    assert convert_unit(5, "unidad", "unidades") == 5


def test_convert_unit_incompatible():
    with pytest.raises(ValueError) as excinfo:
        convert_unit(10, "kg", "l")
    assert "Unidades incompatibles" in str(excinfo.value)


def test_calculate_vat():
    # total 119 => 19
    assert pytest.approx(calculate_vat(119.0)) == 19.0
    assert pytest.approx(calculate_vat(0.0)) == 0.0
    assert pytest.approx(calculate_vat(100.0)) == 100.0 * 19.0 / 119.0


def test_calculate_suggested_restock():
    # current_stock = 3, min_stock = 5 => (5 * 2) - 3 = 7
    assert calculate_suggested_restock(3.0, 5.0) == 7.0
    # current_stock = 5, min_stock = 5 => 0
    assert calculate_suggested_restock(5.0, 5.0) == 0.0
    # current_stock = 10, min_stock = 5 => 0
    assert calculate_suggested_restock(10.0, 5.0) == 0.0


def test_calculate_recipe_fraction():
    # trozado con slices
    assert calculate_recipe_fraction(1.0, "trozado", 8) == 0.125
    assert calculate_recipe_fraction(2.0, "trozado", 10) == 0.2
    # trozado con slices = None (debería usar 8 por defecto)
    assert calculate_recipe_fraction(1.0, "trozado", None) == 0.125
    assert calculate_recipe_fraction(1.0, "trozado", 0) == 0.125
    # entero u otro tipo
    assert calculate_recipe_fraction(1.0, "entero", 8) == 1.0
    assert calculate_recipe_fraction(1.0, None, 8) == 1.0


def test_calculate_loss_valuation():
    assert calculate_loss_valuation(2.5, 1000.0) == 2500.0
    assert calculate_loss_valuation(0.0, 500.0) == 0.0
