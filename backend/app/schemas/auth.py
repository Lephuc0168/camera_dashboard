from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, ConfigDict

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str = "viewer"
    username: str = ""

class TokenData(BaseModel):
    username: str | None = None
    role: str | None = None

class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"

class PasswordResetRequest(BaseModel):
    username: str
    recovery_code: str
    new_password: str

class UserRead(BaseModel):
    user_id: UUID
    username: str
    role: str
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
