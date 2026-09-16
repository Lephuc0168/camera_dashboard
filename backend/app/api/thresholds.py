from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json

from app.db.database import get_db
from app.db.models import IdentityThreshold, Person, User
from app.schemas.threshold import IdentityThresholdRead
from app.auth.jwt import get_current_user
from app.services.threshold_importer import import_thresholds_from_file, import_thresholds_from_data

router = APIRouter(prefix="/thresholds", tags=["Identity Thresholds"])


class ThresholdImportRequest(BaseModel):
    file_path: str | None = None
    clear_existing: bool = True


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
        else:
            t_dict.identity_name = f"Identity {str(t.identity_id)[:8]}" if t.identity_id else "Global EVT Baseline"
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


@router.post("/import")
def import_thresholds(
    request: ThresholdImportRequest = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Imports threshold_table.json into identity_thresholds table per Spec Section 13.6.
    If file_path is omitted, searches default system paths on Jetson:
    - ~/open-set-face-recognition/thresholds/threshold_table.json
    - /home/jetson/open-set-face-recognition/thresholds/threshold_table.json
    """
    file_path = request.file_path if request else None
    clear_existing = request.clear_existing if request else True

    try:
        result = import_thresholds_from_file(file_path=file_path, db=db, clear_existing=clear_existing)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to import threshold table: {str(e)}")


@router.post("/upload")
async def upload_thresholds(
    file: UploadFile = File(...),
    clear_existing: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Accepts direct upload of threshold_table.json from the frontend/browser.
    """
    try:
        content = await file.read()
        raw_data = json.loads(content.decode("utf-8"))
        result = import_thresholds_from_data(raw_data, db=db, clear_existing=clear_existing)
        result["filename"] = file.filename
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse and import uploaded threshold table: {str(e)}")
