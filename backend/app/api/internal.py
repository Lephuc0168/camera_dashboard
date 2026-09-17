import logging
from typing import Any, Dict
from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import RecognitionEvent, Person
from app.websocket.inference import manager

logger = logging.getLogger("internal_inference")

router = APIRouter(tags=["Internal Inference"])

@router.post("/internal/inference")
async def handle_internal_inference(
    request: Request,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    try:
        # Broadcast real-time frames/bboxes to connected frontend WebSocket clients
        await manager.broadcast(payload)
        
        # Check if payload contains an event to record
        status = payload.get("status")
        if status in ["KNOWN", "UNKNOWN", "ABSTAIN"]:
            try:
                person_id = payload.get("person_id")
                person_name = payload.get("person_name") or payload.get("label")
                
                # Resolve person if name is known
                if not person_id and person_name and person_name not in ["Unknown", "UNKNOWN"]:
                    person = db.query(Person).filter(Person.full_name == person_name).first()
                    if person:
                        person_id = person.person_id
                
                event = RecognitionEvent(
                    camera_id=payload.get("camera_id"),
                    track_id=int(payload.get("track_id", 0)),
                    person_id=person_id,
                    status=status,
                    similarity=float(payload.get("similarity", 0.0)) if payload.get("similarity") is not None else None,
                    threshold_value=float(payload.get("threshold", 0.6)) if payload.get("threshold") is not None else None,
                    threshold_type=payload.get("threshold_type", "identity_gpd"),
                    fallback_used=bool(payload.get("fallback_used", False)),
                    quality_score=float(payload.get("quality_score", 0.9)) if payload.get("quality_score") is not None else None,
                    model_version=payload.get("model_version", "w600k_r50"),
                    threshold_table_version=payload.get("threshold_table_version", "v2.0"),
                    snapshot_path=payload.get("snapshot_path")
                )
                db.add(event)
                db.commit()
            except Exception as e_db:
                db.rollback()
                logger.debug(f"Event logging skipped: {e_db}")

        return {"status": "ok", "broadcast": True}
    except Exception as e:
        logger.error(f"Error handling internal inference: {e}")
        return {"status": "ok", "error": str(e)}
