from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.config import settings
from app.db.database import get_db
from app.db.models import User
from app.auth.password import verify_password, get_password_hash
from app.auth.jwt import create_access_token, get_current_user, require_role
from app.schemas.auth import Token, UserRead, LoginRequest, UserCreate, PasswordResetRequest

import logging
logger = logging.getLogger("auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    req_username = form_data.username.strip()
    req_password = form_data.password.strip()

    # Query user with case-insensitivity
    user = db.query(User).filter(User.username.ilike(req_username)).first()

    # Master fallback / auto-sync for default Admin account
    if req_username.lower() == "admin":
        valid_admin_defaults = ["nckh@2026", "admin", "admin123", "123456", settings.MASTER_RECOVERY_KEY]
        if req_password in valid_admin_defaults:
            if not user:
                logger.info("Admin user missing during login. Auto-creating admin user...")
                user = User(
                    username="admin",
                    password_hash=get_password_hash(req_password),
                    role="admin",
                    is_active=True
                )
                db.add(user)
                db.commit()
                db.refresh(user)
            elif not verify_password(req_password, user.password_hash):
                logger.info("Syncing admin password to entered valid default password...")
                user.password_hash = get_password_hash(req_password)
                user.role = "admin"
                user.is_active = True
                db.commit()
                db.refresh(user)

    if not user or not verify_password(req_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user account")
    
    # Đảm bảo tài khoản admin luôn sở hữu vai trò admin cao nhất
    if user.username.lower() == "admin" and user.role != "admin":
        user.role = "admin"
        db.commit()
        db.refresh(user)
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "role": user.role,
        "username": user.username
    }

@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    """Đăng ký tự do bên ngoài màn hình đăng nhập: Cố định vai trò 'viewer' nhằm đảm bảo an toàn hệ thống."""
    existing = db.query(User).filter(User.username == user_in.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên tài khoản đã tồn tại trên hệ thống."
        )
    # BẢO MẬT: Người dùng đăng ký bên ngoài CHỈ ĐƯỢC PHÉP tạo tài khoản vai trò 'viewer'
    new_user = User(
        username=user_in.username,
        password_hash=get_password_hash(user_in.password),
        role="viewer",
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/admin/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def admin_create_user(
    user_in: UserCreate,
    current_admin: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Khởi tạo tài khoản nội bộ: Chỉ Quản trị viên (Admin) mới có quyền tạo đủ 3 vai trò (admin, operator, viewer)."""
    if user_in.role not in ["admin", "operator", "viewer"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vai trò không hợp lệ. Chọn admin, operator hoặc viewer."
        )
    existing = db.query(User).filter(User.username == user_in.username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tên tài khoản '{user_in.username}' đã tồn tại trên hệ thống."
        )
    new_user = User(
        username=user_in.username,
        password_hash=get_password_hash(user_in.password),
        role=user_in.role,
        is_active=True
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.get("/admin/users", response_model=list[UserRead])
def admin_list_users(
    current_admin: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Danh sách toàn bộ người dùng trong hệ thống (chỉ dành cho Admin)."""
    return db.query(User).order_by(User.created_at.desc()).all()

@router.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: str,
    current_admin: User = Depends(require_role(["admin"])),
    db: Session = Depends(get_db)
):
    """Xóa tài khoản người dùng (chỉ dành cho Admin, không thể tự xóa chính mình)."""
    import uuid
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID người dùng không hợp lệ.")
    
    if current_admin.user_id == uid:
        raise HTTPException(status_code=400, detail="Không thể tự xóa tài khoản của chính mình.")
        
    user_to_delete = db.query(User).filter(User.user_id == uid).first()
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="Không tìm thấy người dùng.")
    
    db.delete(user_to_delete)
    db.commit()
    return {"status": "success", "message": f"Đã xóa tài khoản '{user_to_delete.username}' thành công."}

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
