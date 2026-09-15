from uuid import UUID
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import RecognitionEvent, Person, User
from app.schemas.event import RecognitionEventRead, RecognitionEventCreate
from app.auth.jwt import get_current_user

router = APIRouter(prefix="/events", tags=["Recognition Events"])

@router.get("", response_model=list[RecognitionEventRead])
def list_events(
    camera_id: UUID | None = Query(None),
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
        query = query.filter(RecognitionEvent.camera_id == camera_id)
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
    return ev_dict
