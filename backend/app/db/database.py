import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

logger = logging.getLogger("database")

CANDIDATE_URLS = [
    os.getenv("DATABASE_URL"),
    settings.DATABASE_URL,
    "postgresql://open_set_fr:open_set_fr_pass@localhost:5432/open_set_fr",
    "postgresql://open_set_fr:nckh%402026@localhost:5432/open_set_fr",
    "postgresql://open_set_fr:open_set_fr@localhost:5432/open_set_fr",
    "postgresql://open_set_fr:admin@localhost:5432/open_set_fr",
    "postgresql://postgres:postgres@localhost:5432/open_set_fr",
    "postgresql://postgres:nckh%402026@localhost:5432/open_set_fr",
    "postgresql://postgres:admin@localhost:5432/open_set_fr",
    "postgresql://postgres:@localhost:5432/open_set_fr",
]

def get_working_engine():
    """Attempts candidates in order to automatically resolve password differences on Jetson."""
    try:
        import psycopg2
        for url in CANDIDATE_URLS:
            if not url:
                continue
            try:
                conn = psycopg2.connect(url, connect_timeout=1)
                conn.close()
                display_url = url.split("@")[-1] if "@" in url else url
                logger.info(f"Database successfully connected using: {display_url}")
                return create_engine(url, pool_pre_ping=True, pool_size=10, max_overflow=20)
            except Exception:
                continue
    except ImportError:
        pass

    # Fallback to settings.DATABASE_URL
    return create_engine(
        settings.DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20
    )

engine = get_working_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
