from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import AuditLog
from ..auth import require_admin
from ..schemas import AuditLogOut

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=list[AuditLogOut])
def list_audit_logs(
    limit: int = 100,
    seller_id: int | None = None,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = db.query(AuditLog).options(joinedload(AuditLog.seller))
    if seller_id:
        q = q.filter(AuditLog.seller_id == seller_id)
    return q.order_by(AuditLog.created_at.desc()).limit(limit).all()
