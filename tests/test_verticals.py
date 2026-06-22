"""Tests de la lógica de rubros (backend/verticals.py). Sin dependencias externas."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.verticals import (  # noqa: E402
    ALL_CAPABILITIES, VERTICALS, DEFAULT_VERTICAL,
    get_vertical, resolve_capabilities,
    PALETTES, get_palette, list_palettes
)


def test_pasteleria_reproduce_modulos_actuales():
    caps = resolve_capabilities("pasteleria")
    for on in ("showcase", "freshness", "orders", "cooler_stock", "recipes"):
        assert caps[on] is True
    for off in ("tables", "weight_sale", "barcode", "age_restriction"):
        assert caps[off] is False


def test_resolve_devuelve_set_completo():
    caps = resolve_capabilities("botilleria")
    assert set(caps.keys()) == set(ALL_CAPABILITIES)


def test_botilleria_capabilities():
    caps = resolve_capabilities("botilleria")
    assert caps["cooler_stock"] and caps["barcode"] and caps["age_restriction"]
    assert not caps["showcase"] and not caps["orders"]


def test_override_apaga_capability():
    caps = resolve_capabilities("pasteleria", {"freshness": False})
    assert caps["freshness"] is False
    assert caps["showcase"] is True  # el resto del preset intacto


def test_override_ignora_clave_desconocida():
    caps = resolve_capabilities("pasteleria", {"inexistente": True})
    assert "inexistente" not in caps


def test_rubro_desconocido_cae_en_pasteleria():
    assert get_vertical("xxx") is VERTICALS[DEFAULT_VERTICAL]
    assert get_vertical(None) is VERTICALS[DEFAULT_VERTICAL]


def test_vitrina_es_unica_categoria_trozable_en_pasteleria():
    cats = get_vertical("pasteleria")["product_categories"]
    sliceable = [c["value"] for c in cats if c.get("sliceable")]
    assert sliceable == ["vitrina"]


def test_cevicheria_no_es_restaurant():
    caps = resolve_capabilities("cevicheria")
    assert caps["showcase"] and caps["freshness"] and caps["orders"]
    assert caps["cooler_stock"] and caps["weight_sale"]
    assert caps["tables"] is False


def test_cevicheria_ceviches_en_vitrina_pero_no_trozable():
    cats = {c["value"]: c for c in get_vertical("cevicheria")["product_categories"]}
    assert cats["ceviches"]["showcase"] is True
    assert cats["ceviches"].get("sliceable") is False
    # congelados llevan stock
    assert cats["mariscos"].get("stock") is True
    assert cats["pescados"].get("stock") is True


def test_pasteleria_salados_en_vitrina_sin_trozar():
    cats = {c["value"]: c for c in get_vertical("pasteleria")["product_categories"]}
    assert cats["salados"]["showcase"] is True
    assert cats["salados"].get("sliceable") is not True
    assert cats["vitrina"]["sliceable"] is True


def test_todos_los_rubros_tienen_estructura_minima():
    for key, preset in VERTICALS.items():
        assert preset["branding"]["name"]
        assert preset["product_categories"]
        assert preset["expense_categories"]


def test_palettes_structure():
    for pid, p in PALETTES.items():
        assert "label" in p
        assert "primary" in p
        assert "primary_light" in p
        assert "primary_dark" in p
        assert "accent" in p


def test_verticals_palettes():
    for key, preset in VERTICALS.items():
        assert preset["default_palette"] in preset["palettes"]
        assert preset["default_palette"] in PALETTES
        # back-compat
        assert get_palette(preset["default_palette"])["primary"] == preset["branding"]["primary_color"]


def test_terracota_colors():
    t = PALETTES["terracota"]
    assert t["primary"] == "#BF5A2F"
    assert t["primary_light"] == "#D9784E"
    assert t["primary_dark"] == "#943E18"
    assert t["accent"] == "#C9923A"


def test_get_palette_fallback():
    t = PALETTES["terracota"]
    assert get_palette("inexistente") == t
    assert get_palette(None) == t


def test_list_palettes_order():
    palettes = list_palettes("botilleria")
    assert palettes[0]["id"] == "vino"
