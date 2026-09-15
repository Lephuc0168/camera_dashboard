from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import IdentityThreshold, Person, User
from app.schemas.threshold import IdentityThresholdRead
from app.auth.jwt import get_current_user

router = APIRouter(prefix="/thresholds", tags=["Identity Thresholds"])

@router.get("", response_model=list[IdentityThresholdRead])
def list_thresholds(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    thresholds = db.query(IdentityThreshold).order_by(IdentityThreshold.created_at.desc()).all()
    results = []
    for t in thresholds:
        t_dict = IdentityThresholdRead.model_validate(t)
        if t.person:
            t_dict.identity_name = t.person.full_name
        elif t.threshold_type == "global_evt":
            t_dict.identity_name = "Global EVT Baseline"
        elif t.threshold_type == "fixed":
            t_dict.identity_name = "Fixed Baseline"
        results.append(t_dict)
    return results

@router.get("/{identity_id}", response_model=IdentityThresholdRead)
def get_threshold(
    identity_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    t = db.query(IdentityThreshold).filter(IdentityThreshold.identity_id == identity_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Threshold entry not found for this identity")
    t_dict = IdentityThresholdRead.model_validate(t)
    if t.person:
        t_dict.identity_name = t.person.full_name
    return t_dict
