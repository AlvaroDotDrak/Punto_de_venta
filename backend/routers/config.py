import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SystemConfig, Seller
from ..auth import require_admin, get_current_seller, hash_pin
from ..backup import run_manual_backup
from ..seed import seed_vertical
from ..verticals import VERTICALS, DEFAULT_VERTICAL, get_vertical, resolve_capabilities, PALETTES, get_palette, list_palettes
from ..audit import ACTIONS, log_action
from ..schemas import SystemConfigUpdate, ConfigProfileOut, ConfigProfileUpdate, SetupRequest

router = APIRouter(prefix="", tags=["config"])


# ── Helpers de configuración (key/value en SystemConfig, valores JSON-string) ──

def _get(db: Session, key: str) -> str | None:
    item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    return item.value if item else None


def _set(db: Session, key: str, value: str) -> None:
    item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if item:
        item.value = value
    else:
        db.add(SystemConfig(key=key, value=value))


def _get_json(db: Session, key: str, default):
    raw = _get(db, key)
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return default


def build_profile(db: Session) -> dict:
    """Resuelve el bundle de configuración del rubro (preset + overrides de la instancia)."""
    business_type = _get(db, "business_type") or DEFAULT_VERTICAL
    preset = get_vertical(business_type)
    palette_id = _get(db, "palette") or preset.get("default_palette", "terracota")
    colors = get_palette(palette_id)
    capabilities = resolve_capabilities(business_type, _get_json(db, "capabilities", {}))
    branding = {**preset["branding"], **_get_json(db, "branding", {})}
    product_categories = _get_json(db, "product_categories", preset["product_categories"])
    # Overlay de flags estáticos del tipo de categoría (no dependen del snapshot)
    preset_flags = {c["value"]: c.get("age_restricted", False) for c in preset["product_categories"]}
    for c in product_categories:
        c["age_restricted"] = preset_flags.get(c["value"], False)
    tax_rate = float(_get(db, "tax_rate") or 0.19)
    setup_complete = _get(db, "setup_complete") == "true"
    return {
        "business_type": business_type,
        "palette": palette_id,
        "colors": colors,
        "available_palettes": list_palettes(business_type),
        "capabilities": capabilities,
        "branding": branding,
        "product_categories": product_categories,
        "terminology": preset.get("terminology", {}),
        "tax_rate": tax_rate,
        "setup_complete": setup_complete,
    }


# ── Backup ─────────────────────────────────────────────────────────────────────

@router.post("/backup/manual")
def manual_backup(db: Session = Depends(get_db), _=Depends(require_admin)):
    path = run_manual_backup(db)
    return {"path": path, "ok": True}


# ── Perfil de rubro ─────────────────────────────────────────────────────────────

@router.get("/config/profile", response_model=ConfigProfileOut)
def get_profile(db: Session = Depends(get_db)):
    """Público: el branding y capabilities se necesitan antes del login."""
    return build_profile(db)


@router.put("/config/profile", response_model=ConfigProfileOut)
def update_profile(
    payload: ConfigProfileUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    if payload.palette is not None and payload.palette in PALETTES:
        _set(db, "palette", payload.palette)
    if payload.branding is not None:
        merged = {**_get_json(db, "branding", {}), **payload.branding}
        _set(db, "branding", json.dumps(merged))
    if payload.capabilities is not None:
        _set(db, "capabilities", json.dumps(payload.capabilities))
    if payload.product_categories is not None:
        _set(db, "product_categories", json.dumps(payload.product_categories))
    if payload.tax_rate is not None:
        _set(db, "tax_rate", str(payload.tax_rate))
    db.commit()
    return build_profile(db)


@router.post("/setup")
def setup(payload: SetupRequest, db: Session = Depends(get_db)):
    """Configuración inicial de una instancia nueva. Un solo uso."""
    setup_complete = _get(db, "setup_complete") == "true"
    admin_exists = db.query(Seller).filter(Seller.role == "admin").count() > 0
    if setup_complete or admin_exists:
        raise HTTPException(status_code=409, detail="El sistema ya está configurado")
    if payload.business_type not in VERTICALS:
        raise HTTPException(status_code=400, detail="Rubro inválido")
    if not payload.admin_pin or len(payload.admin_pin) < 4:
        raise HTTPException(status_code=400, detail="El PIN debe tener al menos 4 dígitos")

    admin = Seller(
        name=payload.admin_name or "Admin",
        pin=hash_pin(payload.admin_pin),
        role="admin",
        active=True,
    )
    db.add(admin)

    preset = get_vertical(payload.business_type)
    branding = {**preset["branding"]}
    if payload.business_name:
        branding["name"] = payload.business_name
    if payload.branding:
        branding.update(payload.branding)

    palette = payload.palette if payload.palette in PALETTES else preset["default_palette"]
    _set(db, "palette", palette)

    _set(db, "business_type", payload.business_type)
    _set(db, "branding", json.dumps(branding))
    _set(db, "product_categories", json.dumps(preset["product_categories"]))
    _set(db, "tax_rate", "0.19")
    _set(db, "setup_complete", "true")
    db.commit()

    seed_vertical(db, payload.business_type)
    log_action(db, ACTIONS.IMPORT_DATA, admin.id, f"Setup inicial: {payload.business_type}")
    return {"ok": True}


# ── Config genérica (key/value) ─────────────────────────────────────────────────

@router.get("/config", response_model=dict[str, str])
def get_config(db: Session = Depends(get_db), _=Depends(get_current_seller)):
    configs = db.query(SystemConfig).all()
    return {c.key: c.value for c in configs}


@router.put("/config/{key}")
def update_config(
    key: str,
    payload: SystemConfigUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    config_item = db.query(SystemConfig).filter(SystemConfig.key == key).first()
    if not config_item:
        config_item = SystemConfig(key=key, value=payload.value)
        db.add(config_item)
    else:
        config_item.value = payload.value
    db.commit()
    return {"key": key, "value": config_item.value, "ok": True}
