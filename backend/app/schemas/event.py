from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Any

class RecognitionEventBase(BaseModel):
    camera_id: UUID | None = None
    track_id: int
    person_id: UUID | None = None
    status: str  # known / unknown / abstain / error
    similarity: float | None = None
    threshold_value: float | None = None
    threshold_type: str  # fixed / global_evt / identity_gpd
    fallback_used: bool = False
    quality_score: float | None = None
    model_version: str | None = None
    threshold_table_version: str | None = None
    error_code: str | None = None
    snapshot_path: str | None = None
    metadata_json: dict[str, Any] | None = {}

class RecognitionEventCreate(RecognitionEventBase):
    occurred_at: datetime | None = None

class RecognitionEventRead(RecognitionEventBase):
    event_id: UUID
    occurred_at: datetime
    person_name: str | None = None

    model_config = ConfigDict(from_attributes=True)
