import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.config import settings

logger = logging.getLogger("database")

CANDIDATE_URLS = [
    os.getenv("DATABASE_URL"),
    settings.DATABASE_URL,
    # Localhost IPv4 127.0.0.1 (Fastest on Linux, avoids IPv6 resolution timeout)
    "postgresql://open_set_fr:open_set_fr_pass@127.0.0.1:5432/open_set_fr",
    "postgresql://open_set_fr:open_set_fr_pass@localhost:5432/open_set_fr",
    "postgresql://open_set_fr:nckh%402026@127.0.0.1:5432/open_set_fr",
    "postgresql://open_set_fr:nckh%402026@localhost:5432/open_set_fr",
    "postgresql://open_set_fr:jetson@127.0.0.1:5432/open_set_fr",
    "postgresql://open_set_fr:jetson@localhost:5432/open_set_fr",
    "postgresql://open_set_fr:open_set_fr@127.0.0.1:5432/open_set_fr",
    "postgresql://open_set_fr:open_set_fr@localhost:5432/open_set_fr",
    "postgresql://open_set_fr:admin@127.0.0.1:5432/open_set_fr",
    "postgresql://open_set_fr:admin@localhost:5432/open_set_fr",
    "postgresql://postgres:postgres@127.0.0.1:5432/open_set_fr",
    "postgresql://postgres:postgres@localhost:5432/open_set_fr",
    "postgresql://postgres:jetson@127.0.0.1:5432/open_set_fr",
    "postgresql://postgres:jetson@localhost:5432/open_set_fr",
    "postgresql://postgres:nckh%402026@127.0.0.1:5432/open_set_fr",
    "postgresql://postgres:nckh%402026@localhost:5432/open_set_fr",
    "postgresql://postgres:admin@127.0.0.1:5432/open_set_fr",
    "postgresql://postgres:admin@localhost:5432/open_set_fr",
    "postgresql://postgres:@127.0.0.1:5432/open_set_fr",
    "postgresql://postgres:@localhost:5432/open_set_fr",
    "postgresql:///open_set_fr",
    "postgresql://open_set_fr@/open_set_fr",
]

def get_working_engine():
    """Attempts candidates in order to automatically resolve password and host differences on Jetson."""
    try:
        import psycopg2
        for url in CANDIDATE_URLS:
            if not url:
                continue
            try:
                conn = psycopg2.connect(url, connect_timeout=3)
                conn.close()
                display_url = url.split("@")[-1] if "@" in url else url
                logger.info(f"Database successfully connected using: {display_url}")
                os.environ["DATABASE_URL"] = url
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
