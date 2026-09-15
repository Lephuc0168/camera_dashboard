from pydantic import BaseModel

class StatsSummaryRead(BaseModel):
    total_events: int
    known_count: int
    unknown_count: int
    abstain_count: int
    fallback_count: int
    fallback_rate: float  # fallback_count / total_events
    identity_gpd_count: int
    global_evt_count: int
    fixed_count: int

class OpenSetMetricsRead(BaseModel):
    threshold_type: str  # identity_gpd / global_evt / fixed
    far: float  # False Accept Rate
    fur: float  # False Unknown Rate
    tar_at_far: float  # True Accept Rate at target FAR
    auc: float
    precision: float
    recall: float
    f1_score: float
    fallback_rate: float
    gof_pass_rate: float
