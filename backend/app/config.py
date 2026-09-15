import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    PROJECT_NAME: str = "Edge Open-Set Face Recognition API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # PostgreSQL Configuration
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://open_set_fr:open_set_fr_pass@localhost:5432/open_set_fr"
    )
    
    # Security / JWT
    SECRET_KEY: str = os.getenv("JWT_SECRET", "super_secret_open_set_fr_jwt_key_2026")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # CORS
    CORS_ORIGINS: list[str] = ["*"]

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env")

settings = Settings()
