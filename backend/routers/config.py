from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SystemConfig
from ..auth import require_admin, get_current_seller
from ..backup import run_manual_backup
from ..schemas import SystemConfigUpdate

router = APIRouter(prefix="", tags=["config"])


@router.post("/backup/manual")
def manual_backup(db: Session = Depends(get_db), _=Depends(require_admin)):
    path = run_manual_backup(db)
    return {"path": path, "ok": True}


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
