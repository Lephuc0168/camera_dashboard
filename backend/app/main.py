import logging
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.database import SessionLocal, engine, Base, get_db
from app.db.models import User, Camera
from app.auth.password import get_password_hash
from app.auth.jwt import require_role
from app.services.gallery_manager import gallery_state
from sqlalchemy.orm import Session
from sqlalchemy import text

# Imports for API routers
from app.api.auth import router as auth_router
from app.api.persons import router as persons_router
from app.api.cameras import router as cameras_router
from app.api.events import router as events_router
from app.api.thresholds import router as thresholds_router
from app.api.stats import router as stats_router
from app.api.health import router as health_router
from app.api.internal import router as internal_router
from app.websocket.inference import router as ws_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Set CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router, prefix=settings.API_V1_STR)
app.include_router(persons_router, prefix=settings.API_V1_STR)
app.include_router(cameras_router, prefix=settings.API_V1_STR)
app.include_router(events_router, prefix=settings.API_V1_STR)
app.include_router(thresholds_router, prefix=settings.API_V1_STR)
app.include_router(stats_router, prefix=settings.API_V1_STR)
app.include_router(internal_router, prefix=settings.API_V1_STR)
app.include_router(health_router)
app.include_router(ws_router)

@app.get(f"{settings.API_V1_STR}/gallery/reload")
def manual_gallery_reload_api(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Spec Section 14.8: Manual gallery reload
    GET /api/gallery/reload
    Role: admin only
    """
    return gallery_state.reload(db)
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError

@app.exception_handler(OperationalError)
async def db_operational_error_handler(request: Request, exc: OperationalError):
    logger.error(f"Database OperationalError on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database connection error: Không thể kết nối tới PostgreSQL (localhost:5432). Hãy chạy lệnh 'bash scripts/fix_jetson_db.sh' trên terminal Jetson để tự động khởi động và sửa lỗi database.",
            "error_type": "DatabaseConnectionError"
        },
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*"
        }
    )

# Mount static folder for enrolled face portraits
import os
from fastapi.staticfiles import StaticFiles
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.on_event("startup")
def on_startup():
    logger.info("Initializing database tables and seed data...")
    try:
        Base.metadata.create_all(bind=engine)
        # Idempotent migration for Spec v3 Section 13.2 created_by field
        try:
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE persons ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(user_id);"))
                conn.commit()
        except Exception as e_mig:
            logger.info(f"Schema migration check for persons.created_by: {e_mig}")

        db = SessionLocal()
        
        # Seed default Admin User if not exists
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            logger.info("Seeding default admin user (admin / nckh@2026)...")
            admin = User(
                username="admin",
                password_hash=get_password_hash("nckh@2026"),
                role="admin",
                is_active=True
            )
            db.add(admin)
            db.commit()
        elif admin_user.role != "admin":
            logger.info("Enforcing role='admin' for default admin user...")
            admin_user.role = "admin"
            db.commit()
            
        # Seed default Camera if not exists
        default_cam = db.query(Camera).filter(Camera.camera_code == "camera_01").first()
        if not default_cam:
            logger.info("Seeding default camera (camera_01)...")
            cam = Camera(
                camera_code="camera_01",
                name="Jetson CSI Camera 01",
                source_type="csi",
                source_config={"sensor_id": 0, "width": 1920, "height": 1080, "fps": 30},
                is_active=True
            )
            db.add(cam)
            db.commit()

        # Auto-seed identity_thresholds if empty
        from app.db.models import IdentityThreshold
        from app.services.threshold_importer import import_thresholds_from_file
        t_count = db.query(IdentityThreshold).count()
        if t_count == 0:
            logger.info("Identity thresholds table is empty. Attempting auto-import from threshold_table.json...")
            try:
                t_res = import_thresholds_from_file(db=db)
                logger.info(f"Auto-imported {t_res['imported_count']} thresholds from {t_res.get('source_file')}")
            except Exception as e_thresh:
                logger.info(f"Threshold table auto-import skipped: {e_thresh}")
            
        db.close()
        logger.info("Database startup initialization completed successfully.")
    except Exception as e:
        logger.error(f"Error during startup DB seed: {e}")

    # Launch DeepStream telemetry & event logging loop
    from app.services.event_bridge import start_event_bridge_loop
    import asyncio
    asyncio.create_task(start_event_bridge_loop())
