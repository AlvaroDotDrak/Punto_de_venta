"""
Presets de rubro (verticales) para el POS multi-negocio.

Cada instancia corre un solo rubro (business_type). Un rubro es un bundle de:
  - branding por defecto (nombre, tagline, emoji, color)
  - capabilities (interruptores de módulos)
  - categorías de producto (con flag `showcase` para la lógica entero/trozado)
  - categorías de gasto
  - terminología (etiquetas adaptadas al rubro)

Datos puros, sin DB. El admin puede sobreescribir capabilities/branding/categorías
por instancia; estos valores son solo los defaults del rubro.
"""

# Todas las capabilities conocidas. resolve_capabilities() siempre devuelve este
# set completo (las no presentes en un preset quedan en False).
ALL_CAPABILITIES = [
    "showcase",        # vitrina con venta entero/trozado
    "freshness",       # semáforo de caducidad
    "orders",          # pedidos / encargos
    "cooler_stock",    # stock físico por unidad (visicooler / inventario)
    "recipes",         # recetas e insumos (costeo)
    "tables",          # mesas / comandas (Fase 2)
    "weight_sale",     # venta por peso/kg (Fase 3)
    "barcode",         # código de barras (Fase 3)
    "age_restriction", # alerta de venta de alcohol (Fase 2)
]

# Categorías de gasto genéricas reutilizables por rubros no-pastelería.
_GENERIC_EXPENSES = [
    {"name": "Mercadería", "description": "Compra de productos para reventa"},
    {"name": "Arriendo", "description": "Arriendo del local"},
    {"name": "Electricidad", "description": "Cuenta de luz"},
    {"name": "Agua", "description": "Cuenta de agua"},
    {"name": "Sueldos", "description": "Remuneraciones del personal"},
    {"name": "Transporte", "description": "Fletes, combustible, despachos"},
    {"name": "Mantención", "description": "Reparaciones y mantención de equipos"},
    {"name": "Marketing", "description": "Publicidad, redes sociales"},
    {"name": "Otros", "description": "Gastos no categorizados"},
]

# Categorías de gasto de la pastelería (idénticas al seed original — no romper).
_PASTELERIA_EXPENSES = [
    {"name": "Insumos", "description": "Materias primas y productos para elaboración"},
    {"name": "Arriendo", "description": "Arriendo del local"},
    {"name": "Electricidad", "description": "Cuenta de luz"},
    {"name": "Gas", "description": "Gas para hornos y cocina"},
    {"name": "Agua", "description": "Cuenta de agua"},
    {"name": "Sueldos", "description": "Remuneraciones del personal"},
    {"name": "Transporte", "description": "Fletes, combustible, despachos"},
    {"name": "Mantención", "description": "Reparaciones y mantención de equipos"},
    {"name": "Marketing", "description": "Publicidad, redes sociales, packaging"},
    {"name": "Otros", "description": "Gastos no categorizados"},
]


PALETTES = {
    "terracota": {"label": "Terracota", "primary": "#BF5A2F", "primary_light": "#D9784E", "primary_dark": "#943E18", "accent": "#C9923A"},
    "chocolate": {"label": "Chocolate", "primary": "#6B4226", "primary_light": "#8A5A38", "primary_dark": "#4E2F18", "accent": "#C9923A"},
    "frambuesa": {"label": "Frambuesa", "primary": "#B23A5E", "primary_light": "#CC5C7E", "primary_dark": "#8A2545", "accent": "#E0A050"},
    "miel": {"label": "Miel", "primary": "#C8820A", "primary_light": "#E0A030", "primary_dark": "#9A6200", "accent": "#BF5A2F"},
    "durazno": {"label": "Durazno", "primary": "#E08A4C", "primary_light": "#F0A56E", "primary_dark": "#B5612E", "accent": "#C2607A"},
    "vino": {"label": "Vino Tinto", "primary": "#7B2D26", "primary_light": "#9A463E", "primary_dark": "#581913", "accent": "#C9923A"},
    "verde_botella": {"label": "Verde Botella", "primary": "#1F5E3A", "primary_light": "#357A52", "primary_dark": "#123F26", "accent": "#C9A227"},
    "ambar": {"label": "Ámbar", "primary": "#B5791F", "primary_light": "#D49A3E", "primary_dark": "#875812", "accent": "#6B4A2A"},
    "azul_noche": {"label": "Azul Noche", "primary": "#2A3D66", "primary_light": "#44588A", "primary_dark": "#1A2848", "accent": "#C9923A"},
    "marino": {"label": "Azul Marino", "primary": "#1F6F8B", "primary_light": "#3A8AA6", "primary_dark": "#134E63", "accent": "#E08A3C"},
    "turquesa": {"label": "Turquesa", "primary": "#138086", "primary_light": "#2BA0A6", "primary_dark": "#0A5E63", "accent": "#F2A65A"},
    "coral": {"label": "Coral", "primary": "#E0613F", "primary_light": "#F0815F", "primary_dark": "#B5462A", "accent": "#2E8B8B"},
    "verde_hoja": {"label": "Verde Hoja", "primary": "#3E7C3A", "primary_light": "#5A9A54", "primary_dark": "#2A5C28", "accent": "#D98A2B"},
    "tomate": {"label": "Tomate", "primary": "#C0392B", "primary_light": "#D85547", "primary_dark": "#93271B", "accent": "#3E7C3A"},
    "berenjena": {"label": "Berenjena", "primary": "#6A3D6E", "primary_light": "#875990", "primary_dark": "#4E2A52", "accent": "#9AB54A"},
    "azul_retail": {"label": "Azul", "primary": "#2C5F8A", "primary_light": "#4880AB", "primary_dark": "#1C4366", "accent": "#E08A3C"},
    "rojo_retail": {"label": "Rojo", "primary": "#C42B33", "primary_light": "#DC4A52", "primary_dark": "#961D24", "accent": "#2C5F8A"},
    "gris_azulado": {"label": "Gris Azulado", "primary": "#455A6B", "primary_light": "#5E7787", "primary_dark": "#2F3E4A", "accent": "#E0A030"},
    "marron_calido": {"label": "Marrón Cálido", "primary": "#8A5A2C", "primary_light": "#A6764A", "primary_dark": "#66401C", "accent": "#C9923A"},
    "oliva": {"label": "Oliva", "primary": "#6B7A2C", "primary_light": "#8A9A45", "primary_dark": "#4E5C1C", "accent": "#C0392B"},
    "burdeos": {"label": "Burdeos", "primary": "#7A2230", "primary_light": "#9A3848", "primary_dark": "#581620", "accent": "#C9923A"},
}

VERTICALS = {
    # ── Pastelería (rubro original; reproduce el comportamiento actual) ─────────
    "pasteleria": {
        "label": "Pastelería",
        "palettes": ["terracota", "chocolate", "frambuesa", "miel", "durazno"],
        "default_palette": "terracota",
        "branding": {
            "name": "Mi Pastelería",
            "tagline": "PASTELERÍA ARTESANAL",
            "emoji": "🧁",
            "primary_color": "#BF5A2F",
        },
        "capabilities": {
            "showcase": True,
            "freshness": True,
            "orders": True,
            "cooler_stock": True,
            "recipes": True,
        },
        "product_categories": [
            {"value": "vitrina", "label": "Vitrina", "emoji": "🍰", "showcase": True, "sliceable": True},
            {"value": "salados", "label": "Salados", "emoji": "🥪", "showcase": True, "sliceable": False},
            {"value": "encargo", "label": "Encargo", "emoji": "🎂", "showcase": False},
            {"value": "bebidas", "label": "Bebidas", "emoji": "🥤", "showcase": False, "stock": True},
            {"value": "cafe", "label": "Café", "emoji": "☕", "showcase": False},
            {"value": "mostrador", "label": "Mostrador", "emoji": "🍪", "showcase": False, "stock": True},
        ],
        "expense_categories": _PASTELERIA_EXPENSES,
        "terminology": {
            "showcase": "Vitrina",
            "cooler": "Visicooler",
            "orders": "Pedidos",
        },
    },

    # ── Botillería (retail de licores/bebidas) ─────────────────────────────────
    "botilleria": {
        "label": "Botillería",
        "palettes": ["vino", "verde_botella", "ambar", "azul_noche"],
        "default_palette": "vino",
        "branding": {
            "name": "Mi Botillería",
            "tagline": "LICORES Y BEBIDAS",
            "emoji": "🍷",
            "primary_color": "#7B2D26",
        },
        "capabilities": {
            "cooler_stock": True,
            "barcode": True,
            "age_restriction": True,
        },
        "product_categories": [
            {"value": "cervezas", "label": "Cervezas", "emoji": "🍺", "showcase": False, "stock": True, "age_restricted": True},
            {"value": "vinos", "label": "Vinos", "emoji": "🍷", "showcase": False, "stock": True, "age_restricted": True},
            {"value": "destilados", "label": "Destilados", "emoji": "🥃", "showcase": False, "stock": True, "age_restricted": True},
            {"value": "bebidas", "label": "Bebidas", "emoji": "🥤", "showcase": False, "stock": True},
            {"value": "snacks", "label": "Snacks", "emoji": "🍫", "showcase": False, "stock": True},
            {"value": "cigarros", "label": "Cigarros", "emoji": "🚬", "showcase": False, "stock": True, "age_restricted": True},
        ],
        "expense_categories": _GENERIC_EXPENSES,
        "terminology": {
            "cooler": "Inventario",
        },
    },

    # ── Cevichería (ceviches del día en vitrina + congelados por peso) ──────────
    # NO es restaurant: vitrina de tuppers (sin trozar), encargos por WhatsApp,
    # y mariscos/salmón congelados por unidad o peso. Sin mesas.
    "cevicheria": {
        "label": "Cevichería",
        "palettes": ["marino", "turquesa", "coral"],
        "default_palette": "marino",
        "branding": {
            "name": "Mi Cevichería",
            "tagline": "MARISCOS Y CEVICHES",
            "emoji": "🦐",
            "primary_color": "#1F6F8B",
        },
        "capabilities": {
            "showcase": True,       # vitrina de tuppers (sin trozado)
            "freshness": True,
            "orders": True,         # encargos por WhatsApp
            "cooler_stock": True,
            "weight_sale": True,    # congelados por kg
        },
        "product_categories": [
            # ceviches: van a la vitrina con frescura, pero se venden por unidad (tupper)
            {"value": "ceviches", "label": "Ceviches", "emoji": "🐟", "showcase": True, "sliceable": False},
            {"value": "mariscos", "label": "Mariscos", "emoji": "🦐", "showcase": False, "stock": True},
            {"value": "pescados", "label": "Pescados", "emoji": "🐠", "showcase": False, "stock": True},
            {"value": "bebidas", "label": "Bebidas", "emoji": "🥤", "showcase": False, "stock": True},
            {"value": "extras", "label": "Extras", "emoji": "🍋", "showcase": False},
        ],
        "expense_categories": _GENERIC_EXPENSES,
        "terminology": {
            "showcase": "Vitrina",
            "orders": "Encargos",
            "cooler": "Inventario",
        },
    },

    # ── Verdulería (frutas y verduras; venta por peso en Fase 3) ───────────────
    "verduleria": {
        "label": "Verdulería",
        "palettes": ["verde_hoja", "tomate", "berenjena"],
        "default_palette": "verde_hoja",
        "branding": {
            "name": "Mi Verdulería",
            "tagline": "FRUTAS Y VERDURAS",
            "emoji": "🥬",
            "primary_color": "#3E7C3A",
        },
        "capabilities": {
            "freshness": True,
            "cooler_stock": True,
            "weight_sale": True,
        },
        "product_categories": [
            {"value": "frutas", "label": "Frutas", "emoji": "🍎", "showcase": False, "stock": True},
            {"value": "verduras", "label": "Verduras", "emoji": "🥕", "showcase": False, "stock": True},
            {"value": "abarrotes", "label": "Abarrotes", "emoji": "🛒", "showcase": False, "stock": True},
        ],
        "expense_categories": _GENERIC_EXPENSES,
        "terminology": {
            "cooler": "Inventario",
        },
    },

    # ── Minimarket (retail general con código de barras) ───────────────────────
    "minimarket": {
        "label": "Minimarket",
        "palettes": ["azul_retail", "rojo_retail", "gris_azulado"],
        "default_palette": "azul_retail",
        "branding": {
            "name": "Mi Minimarket",
            "tagline": "ALMACÉN Y ABARROTES",
            "emoji": "🏪",
            "primary_color": "#2C5F8A",
        },
        "capabilities": {
            "cooler_stock": True,
            "barcode": True,
        },
        "product_categories": [
            {"value": "abarrotes", "label": "Abarrotes", "emoji": "🛒", "showcase": False, "stock": True},
            {"value": "bebidas", "label": "Bebidas", "emoji": "🥤", "showcase": False, "stock": True},
            {"value": "snacks", "label": "Snacks", "emoji": "🍫", "showcase": False, "stock": True},
            {"value": "limpieza", "label": "Limpieza", "emoji": "🧽", "showcase": False, "stock": True},
            {"value": "lacteos", "label": "Lácteos", "emoji": "🥛", "showcase": False, "stock": True},
        ],
        "expense_categories": _GENERIC_EXPENSES,
        "terminology": {
            "cooler": "Inventario",
        },
    },

    # ── Restaurant (mesas/comandas + cocina) ───────────────────────────────────
    "restaurant": {
        "label": "Restaurant",
        "palettes": ["marron_calido", "oliva", "burdeos", "vino"],
        "default_palette": "marron_calido",
        "branding": {
            "name": "Mi Restaurant",
            "tagline": "COCINA Y COMEDOR",
            "emoji": "🍽️",
            "primary_color": "#8A5A2C",
        },
        "capabilities": {
            "freshness": True,
            "cooler_stock": True,
            "recipes": True,
            "tables": True,
        },
        "product_categories": [
            {"value": "entradas", "label": "Entradas", "emoji": "🥗", "showcase": False},
            {"value": "fondos", "label": "Fondos", "emoji": "🍝", "showcase": False},
            {"value": "bebidas", "label": "Bebidas", "emoji": "🥤", "showcase": False, "stock": True},
            {"value": "postres", "label": "Postres", "emoji": "🍰", "showcase": False},
        ],
        "expense_categories": _GENERIC_EXPENSES,
        "terminology": {
            "orders": "Comandas",
            "cooler": "Inventario",
        },
    },
}

DEFAULT_VERTICAL = "pasteleria"


def get_vertical(business_type: str | None) -> dict:
    """Devuelve el preset del rubro, con fallback a pastelería."""
    return VERTICALS.get(business_type or DEFAULT_VERTICAL, VERTICALS[DEFAULT_VERTICAL])


def resolve_capabilities(business_type: str | None, overrides: dict | None = None) -> dict:
    """
    Capabilities efectivas = defaults del preset, mezclados con overrides de la
    instancia. Siempre devuelve el set completo de ALL_CAPABILITIES (False por defecto).
    """
    preset = get_vertical(business_type)
    resolved = {cap: False for cap in ALL_CAPABILITIES}
    resolved.update(preset.get("capabilities", {}))
    if overrides:
        for cap, value in overrides.items():
            if cap in resolved:
                resolved[cap] = bool(value)
    return resolved


def get_palette(palette_id: str | None) -> dict:
    """Devuelve la paleta por id; fallback a 'terracota' si no existe."""
    return PALETTES.get(palette_id or "terracota", PALETTES["terracota"])


def list_palettes(business_type: str | None) -> list[dict]:
    """Paletas curadas del rubro, como lista de dicts con su id incluido."""
    preset = get_vertical(business_type)
    ids = preset.get("palettes") or [preset.get("default_palette", "terracota")]
    return [{"id": pid, **PALETTES[pid]} for pid in ids if pid in PALETTES]
