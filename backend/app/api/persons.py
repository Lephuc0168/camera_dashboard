from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import get_db
from app.db.models import Person, FaceEmbedding, User
from app.schemas.person import PersonCreate, PersonUpdate, PersonRead
from app.auth.jwt import get_current_user, require_role

router = APIRouter(prefix="/persons", tags=["Persons"])

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
        emb_count = db.query(func.count(FaceEmbedding.embedding_id)).filter(FaceEmbedding.person_id == p.person_id).scalar()
        p_dict = PersonRead.model_validate(p)
        p_dict.embedding_count = emb_count
        results.append(p_dict)
    return results

@router.post("", response_model=PersonRead, status_code=status.HTTP_201_CREATED)
def create_person(
    person_in: PersonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "operator"]))
):
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

@router.get("/{person_id}", response_model=PersonRead)
def get_person(
    person_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    person = db.query(Person).filter(Person.person_id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    emb_count = db.query(func.count(FaceEmbedding.embedding_id)).filter(FaceEmbedding.person_id == person_id).scalar()
    res = PersonRead.model_validate(person)
    res.embedding_count = emb_count
    return res

@router.delete("/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_person(
    person_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "operator"]))
):
    person = db.query(Person).filter(Person.person_id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    db.delete(person)
    db.commit()
    return None
