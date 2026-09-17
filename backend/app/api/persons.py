import os
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.database import get_db
from app.db.models import Person, FaceEmbedding, User
from app.schemas.person import PersonCreate, PersonUpdate, PersonRead
from app.auth.jwt import get_current_user, require_role
from app.services.face_enrollment import (
    enroll_face_pipeline,
    QualityGateError,
    ENROLLED_FACES_DIR
)

router = APIRouter(prefix="/persons", tags=["Persons"])


def get_photo_path(person_id: UUID) -> str:
    return os.path.join(ENROLLED_FACES_DIR, f"{person_id}.jpg")


@router.get("", response_model=list[PersonRead])
def list_persons(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    persons = db.query(Person).offset(skip).limit(limit).all()
    results = []
    for p in persons:
        emb_query = db.query(FaceEmbedding).filter(FaceEmbedding.person_id == p.person_id).order_by(FaceEmbedding.created_at.desc()).first()
        emb_count = db.query(func.count(FaceEmbedding.embedding_id)).filter(FaceEmbedding.person_id == p.person_id).scalar() or 0
        
        p_dict = PersonRead.model_validate(p)
        p_dict.embedding_count = emb_count
        
        # Check if portrait photo exists
        if os.path.isfile(get_photo_path(p.person_id)):
            p_dict.photo_url = f"/api/persons/{p.person_id}/photo"
        
        if emb_query and emb_query.quality_score is not None:
            p_dict.quality_score = emb_query.quality_score
            
        results.append(p_dict)
    return results


@router.post("", response_model=PersonRead, status_code=status.HTTP_201_CREATED)
def create_person(
    person_in: PersonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "operator"]))
):
    """Metadata-only registration (Backwards compatibility)."""
    if person_in.student_code:
        existing = db.query(Person).filter(Person.student_code == person_in.student_code).first()
        if existing:
            raise HTTPException(status_code=400, detail="Student code already registered")
            
    person = Person(**person_in.model_dump())
    db.add(person)
    db.commit()
    db.refresh(person)
    res = PersonRead.model_validate(person)
    res.embedding_count = 0
    return res


@router.post("/enroll", response_model=PersonRead, status_code=status.HTTP_201_CREATED)
async def enroll_person_with_face(
    full_name: str = Form(...),
    student_code: str | None = Form(None),
    status_str: str = Form("active"),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "operator"]))
):
    """
    Complete Face Enrollment per Spec Section 25:
    - Registers Person profile in PostgreSQL
    - Runs Quality Gate on face photo (resolution, blur, detection)
    - Aligns and extracts 512D unit-normalized embedding
    - Configures Global EVT Fallback in identity_thresholds
    """
    clean_code = student_code.strip() if student_code and student_code.strip() else None
    if clean_code:
        existing = db.query(Person).filter(Person.student_code == clean_code).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Student code '{clean_code}' is already registered")

    person = Person(
        full_name=full_name.strip(),
        student_code=clean_code,
        status=status_str
    )
    db.add(person)
    db.commit()
    db.refresh(person)

    quality_score = None
    photo_url = None

    if photo is not None:
        try:
            image_bytes = await photo.read()
            if len(image_bytes) > 0:
                enroll_res = enroll_face_pipeline(image_bytes, person, db)
                quality_score = enroll_res.get("quality_score")
                photo_url = f"/api/persons/{person.person_id}/photo"
        except QualityGateError as qe:
            db.delete(person)
            db.commit()
            raise HTTPException(status_code=422, detail=str(qe))
        except Exception as e:
            db.delete(person)
            db.commit()
            raise HTTPException(status_code=400, detail=f"Failed to process face enrollment: {str(e)}")

    res = PersonRead.model_validate(person)
    res.embedding_count = 1 if photo is not None else 0
    res.quality_score = quality_score
    res.photo_url = photo_url
    return res


@router.get("/{person_id}", response_model=PersonRead)
def get_person(
    person_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    person = db.query(Person).filter(Person.person_id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    
    emb_query = db.query(FaceEmbedding).filter(FaceEmbedding.person_id == person_id).order_by(FaceEmbedding.created_at.desc()).first()
    emb_count = db.query(func.count(FaceEmbedding.embedding_id)).filter(FaceEmbedding.person_id == person_id).scalar() or 0
    
    res = PersonRead.model_validate(person)
    res.embedding_count = emb_count
    if os.path.isfile(get_photo_path(person_id)):
        res.photo_url = f"/api/persons/{person_id}/photo"
    if emb_query and emb_query.quality_score is not None:
        res.quality_score = emb_query.quality_score
    return res


@router.get("/{person_id}/photo")
def get_person_photo(
    person_id: UUID,
    db: Session = Depends(get_db)
):
    """Serves the enrolled portrait face thumbnail."""
    path = get_photo_path(person_id)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Photo not found for this enrolled person")
    return FileResponse(path, media_type="image/jpeg")


@router.post("/{person_id}/photo")
async def add_person_photo(
    person_id: UUID,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "operator"]))
):
    """Adds or updates face photo and 512D embedding for an existing enrolled person."""
    person = db.query(Person).filter(Person.person_id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")

    try:
        image_bytes = await photo.read()
        enroll_res = enroll_face_pipeline(image_bytes, person, db)
        return {
            "status": "success",
            "quality_score": enroll_res.get("quality_score"),
            "photo_url": f"/api/persons/{person_id}/photo"
        }
    except QualityGateError as qe:
        raise HTTPException(status_code=422, detail=str(qe))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Enrollment error: {str(e)}")


@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(
    person_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "operator"]))
):
    person = db.query(Person).filter(Person.person_id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
        
    # Remove photo if exists
    photo_file = get_photo_path(person_id)
    if os.path.isfile(photo_file):
        try:
            os.remove(photo_file)
        except Exception:
            pass

    db.delete(person)
    db.commit()
    return None
