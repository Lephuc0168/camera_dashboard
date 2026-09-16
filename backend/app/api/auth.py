from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.config import settings
from app.db.database import get_db
from app.db.models import User
from app.auth.password import verify_password, get_password_hash
from app.auth.jwt import create_access_token, get_current_user
from app.schemas.auth import Token, UserRead, LoginRequest, UserCreate, PasswordResetRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user account")
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    }

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.username == user_in.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên tài khoản đã tồn tại trên hệ thống."
        )
    new_user = User(
        username=user_in.username,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role if user_in.role in ["admin", "operator", "viewer"] else "operator",
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/reset-password")
def reset_password(req: PasswordResetRequest, db: Session = Depends(get_db)):
    if req.recovery_code != settings.MASTER_RECOVERY_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Mã khôi phục bảo mật (Master Recovery Key) không chính xác."
        )
    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy tài khoản người dùng."
        )
    user.password_hash = get_password_hash(req.new_password)
    db.commit()
    return {"status": "success", "message": "Đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu mới."}

@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user
