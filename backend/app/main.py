import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.database import SessionLocal, engine, Base
from app.db.models import User, Camera
from app.auth.password import get_password_hash

# Imports for API routers
from app.api.auth import router as auth_router
from app.api.persons import router as persons_router
from app.api.cameras import router as cameras_router
from app.api.events import router as events_router
from app.api.thresholds import router as thresholds_router
from app.api.stats import router as stats_router
from app.api.health import router as health_router
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
app.include_router(health_router)
app.include_router(ws_router)

@app.on_event("startup")
def on_startup():
    logger.info("Initializing database tables and seed data...")
    try:
        Base.metadata.create_all(bind=engine)
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
            
        db.close()
        logger.info("Database startup initialization completed successfully.")
    except Exception as e:
        logger.error(f"Error during startup DB seed: {e}")

    # Launch DeepStream telemetry & event logging loop
    from app.services.event_bridge import start_event_bridge_loop
    import asyncio
    asyncio.create_task(start_event_bridge_loop())
