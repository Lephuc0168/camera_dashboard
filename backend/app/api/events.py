from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, and_, not_
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import RecognitionEvent, Person, User, Camera
from app.schemas.event import RecognitionEventRead, RecognitionEventCreate
from app.auth.jwt import get_current_user

router = APIRouter(prefix="/events", tags=["Recognition Events"])

@router.get("", response_model=list[RecognitionEventRead])
def list_events(
    camera_id: str | None = Query(None),
    person_id: UUID | None = Query(None),
    status: str | None = Query(None),
    threshold_type: str | None = Query(None),
    fallback_used: bool | None = Query(None),
    start_time: datetime | None = Query(None),
    end_time: datetime | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(RecognitionEvent)
    if camera_id:
        try:
            cid_uuid = UUID(camera_id)
            query = query.filter(RecognitionEvent.camera_id == cid_uuid)
        except (ValueError, TypeError):
            clean = camera_id.lower().replace('-', '_')
            if clean in ['camera_1', 'camera_01', '0', 'rtsp']:
                query = query.outerjoin(Camera, RecognitionEvent.camera_id == Camera.camera_id).filter(
                    or_(
                        Camera.camera_code.in_(['camera_01', 'camera_1']),
                        RecognitionEvent.snapshot_path.ilike('%camera_1%'),
                        RecognitionEvent.snapshot_path.ilike('%camera_01%'),
                        and_(
                            RecognitionEvent.camera_id.is_(None),
                            or_(
                                RecognitionEvent.snapshot_path.is_(None),
                                and_(
                                    not_(RecognitionEvent.snapshot_path.ilike('%camera_2%')),
                                    not_(RecognitionEvent.snapshot_path.ilike('%camera_02%'))
                                )
                            )
                        )
                    )
                )
            elif clean in ['camera_2', 'camera_02', '1', 'csi']:
                query = query.outerjoin(Camera, RecognitionEvent.camera_id == Camera.camera_id).filter(
                    or_(
                        Camera.camera_code.in_(['camera_02', 'camera_2']),
                        RecognitionEvent.snapshot_path.ilike('%camera_2%'),
                        RecognitionEvent.snapshot_path.ilike('%camera_02%')
                    )
                )
            else:
                query = query.outerjoin(Camera, RecognitionEvent.camera_id == Camera.camera_id).filter(
                    Camera.camera_code.ilike(f"%{clean}%")
                )

    if person_id:
        query = query.filter(RecognitionEvent.person_id == person_id)
    if status:
        query = query.filter(RecognitionEvent.status == status)
    if threshold_type:
        query = query.filter(RecognitionEvent.threshold_type == threshold_type)
    if fallback_used is not None:
        query = query.filter(RecognitionEvent.fallback_used == fallback_used)
    if start_time:
        query = query.filter(RecognitionEvent.occurred_at >= start_time)
    if end_time:
        query = query.filter(RecognitionEvent.occurred_at <= end_time)

    events = query.order_by(RecognitionEvent.occurred_at.desc()).offset(offset).limit(limit).all()
    results = []
    for ev in events:
        ev_dict = RecognitionEventRead.model_validate(ev)
        if ev.person:
            ev_dict.person_name = ev.person.full_name
        elif ev.status == "UNKNOWN":
            ev_dict.person_name = "UNKNOWN"

        c_code = "camera_01"
        c_name = "RTSP Camera 01"
        if ev.camera:
            c_code = ev.camera.camera_code
            c_name = ev.camera.name
        elif ev.snapshot_path:
            if "camera_2" in ev.snapshot_path or "camera_02" in ev.snapshot_path:
                c_code = "camera_02"
                c_name = "CSI Camera 02"
            elif "camera_1" in ev.snapshot_path or "camera_01" in ev.snapshot_path:
                c_code = "camera_01"
                c_name = "RTSP Camera 01"
        elif ev.metadata_json and isinstance(ev.metadata_json, dict):
            m_cam = str(ev.metadata_json.get("camera_id") or "")
            if "2" in m_cam:
                c_code = "camera_02"
                c_name = "CSI Camera 02"

        ev_dict.camera_code = c_code
        ev_dict.camera_name = c_name
        results.append(ev_dict)
    return results

@router.post("", response_model=RecognitionEventRead)
def create_event(
    event_in: RecognitionEventCreate,
    db: Session = Depends(get_db)
):
    event = RecognitionEvent(**event_in.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    ev_dict = RecognitionEventRead.model_validate(event)
    if event.person:
        ev_dict.person_name = event.person.full_name
    elif event.status == "UNKNOWN":
        ev_dict.person_name = "UNKNOWN"
    
    c_code = "camera_01"
    c_name = "RTSP Camera 01"
    if event.camera:
        c_code = event.camera.camera_code
        c_name = event.camera.name
    elif event.snapshot_path:
        if "camera_2" in event.snapshot_path or "camera_02" in event.snapshot_path:
            c_code = "camera_02"
            c_name = "CSI Camera 02"
        elif "camera_1" in event.snapshot_path or "camera_01" in event.snapshot_path:
            c_code = "camera_01"
            c_name = "RTSP Camera 01"
    ev_dict.camera_code = c_code
    ev_dict.camera_name = c_name
    return ev_dict
