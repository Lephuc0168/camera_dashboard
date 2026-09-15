from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class IdentityThresholdRead(BaseModel):
    threshold_id: UUID
    threshold_table_version: str
    identity_id: UUID | None = None
    identity_name: str | None = None
    threshold_type: str  # identity_gpd / global_evt / fixed
    threshold_value: float
    fallback_used: bool
    n_impostor_scores: int | None = None
    n_exceedances: int | None = None
    u_quantile: float | None = None
    u_value: float | None = None
    alpha: float | None = None
    gpd_shape: float | None = None
    gpd_scale: float | None = None
    fit_status: str  # valid / warning / failed / fallback
    model_version: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
