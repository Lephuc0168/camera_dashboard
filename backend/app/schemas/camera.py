from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Any

class CameraBase(BaseModel):
    camera_code: str
    name: str
    source_type: str  # csi / rtsp
    source_config: dict[str, Any] = {}
    is_active: bool = True

class CameraCreate(CameraBase):
    pass

class CameraRead(CameraBase):
    camera_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
