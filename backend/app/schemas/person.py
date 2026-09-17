from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class PersonBase(BaseModel):
    full_name: str
    student_code: str | None = None
    status: str = "active"

class PersonCreate(PersonBase):
    pass

class PersonUpdate(BaseModel):
    full_name: str | None = None
    student_code: str | None = None
    status: str | None = None

class PersonRead(PersonBase):
    person_id: UUID
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    embedding_count: int = 0
    photo_url: str | None = None
    quality_score: float | None = None

    model_config = ConfigDict(from_attributes=True)
