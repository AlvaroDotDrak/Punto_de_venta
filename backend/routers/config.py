from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import require_admin
from ..backup import run_manual_backup

router = APIRouter(prefix="/backup", tags=["config"])


@router.post("/manual")
def manual_backup(db: Session = Depends(get_db), _=Depends(require_admin)):
    path = run_manual_backup(db)
    return {"path": path, "ok": True}
