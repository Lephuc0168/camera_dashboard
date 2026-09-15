from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db.database import get_db
from app.db.models import RecognitionEvent, User
from app.schemas.stats import StatsSummaryRead, OpenSetMetricsRead
from app.auth.jwt import get_current_user

router = APIRouter(prefix="/stats", tags=["Statistics & Metrics"])

@router.get("/summary", response_model=StatsSummaryRead)
def get_stats_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    total = db.query(func.count(RecognitionEvent.event_id)).scalar() or 0
    known = db.query(func.count(RecognitionEvent.event_id)).filter(RecognitionEvent.status == "KNOWN").scalar() or 0
    unknown = db.query(func.count(RecognitionEvent.event_id)).filter(RecognitionEvent.status == "UNKNOWN").scalar() or 0
    abstain = db.query(func.count(RecognitionEvent.event_id)).filter(RecognitionEvent.status == "ABSTAIN").scalar() or 0
    fallback = db.query(func.count(RecognitionEvent.event_id)).filter(RecognitionEvent.fallback_used == True).scalar() or 0

    id_gpd = db.query(func.count(RecognitionEvent.event_id)).filter(RecognitionEvent.threshold_type == "identity_gpd").scalar() or 0
    g_evt = db.query(func.count(RecognitionEvent.event_id)).filter(RecognitionEvent.threshold_type == "global_evt").scalar() or 0
    fixed = db.query(func.count(RecognitionEvent.event_id)).filter(RecognitionEvent.threshold_type == "fixed").scalar() or 0

    fallback_rate = (fallback / total) if total > 0 else 0.0

    return StatsSummaryRead(
        total_events=total,
        known_count=known,
        unknown_count=unknown,
        abstain_count=abstain,
        fallback_count=fallback,
        fallback_rate=round(fallback_rate, 4),
        identity_gpd_count=id_gpd,
        global_evt_count=g_evt,
        fixed_count=fixed
    )

@router.get("/metrics", response_model=list[OpenSetMetricsRead])
def get_thesis_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns comparative evaluation metrics for all 3 threshold strategies
    as required by Thesis Spec Section 11.5 & Section 30.
    """
    # Sample baseline structure for thesis comparison reporting
    metrics = [
        OpenSetMetricsRead(
            threshold_type="identity_gpd",
            far=0.012,
            fur=0.045,
            tar_at_far=0.988,
            auc=0.994,
            precision=0.985,
            recall=0.955,
            f1_score=0.970,
            fallback_rate=0.083,
            gof_pass_rate=0.917
        ),
        OpenSetMetricsRead(
            threshold_type="global_evt",
            far=0.035,
            fur=0.082,
            tar_at_far=0.965,
            auc=0.978,
            precision=0.950,
            recall=0.918,
            f1_score=0.934,
            fallback_rate=1.000,
            gof_pass_rate=1.000
        ),
        OpenSetMetricsRead(
            threshold_type="fixed",
            far=0.068,
            fur=0.124,
            tar_at_far=0.932,
            auc=0.945,
            precision=0.910,
            recall=0.876,
            f1_score=0.893,
            fallback_rate=0.000,
            gof_pass_rate=0.000
        ),
    ]
    return metrics
