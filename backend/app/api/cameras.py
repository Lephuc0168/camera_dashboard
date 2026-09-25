from uuid import UUID
import urllib.request
from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import Camera, User
from app.schemas.camera import CameraCreate, CameraRead
from app.auth.jwt import get_current_user, require_role
from jose import JWTError, jwt
from app.config import settings

router = APIRouter(prefix="/cameras", tags=["Cameras"])

def get_stream_user(
    token: str | None = Query(None),
    authorization: str | None = Header(None),
    db: Session = Depends(get_db)
) -> User:
    """
    Validates JWT token for live camera stream access.
    Supports token passed via '?token=' query parameter (standard for browser <img> tags)
    or via 'Authorization: Bearer <token>' header.
    """
    raw_token = token
    if not raw_token and authorization and authorization.startswith("Bearer "):
        raw_token = authorization.split(" ")[1]

    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token required to access secure camera stream",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(raw_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token credentials")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = db.query(User).filter(User.username == username).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user

def generate_camera_stream(camera_id: str):
    cid_clean = camera_id.lower().strip()
    if cid_clean in ["camera-0", "camera_0", "camera_01", "0", "csi", "camera_1"]:
        target_cid = "camera_1"
    elif cid_clean in ["camera-1", "camera_02", "camera_2", "1", "rtsp"]:
        target_cid = "camera_2"
    else:
        target_cid = camera_id

    # Try local port 5001 (DeepStream face_api_server), then port 5000 (legacy app.py)
    urls_to_try = [
        f"http://127.0.0.1:5001/video_feed/{target_cid}",
        f"http://127.0.0.1:5001/video_feed/{camera_id}",
        f"http://127.0.0.1:5000/video_feed/{target_cid}",
        f"http://127.0.0.1:5000/video_feed/{camera_id}",
        f"http://127.0.0.1:5001/video_feed",
        f"http://127.0.0.1:5000/video_feed"
    ]
    
    for url in urls_to_try:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CameraProxy/1.0"})
            with urllib.request.urlopen(req, timeout=3) as stream_resp:
                while True:
                    chunk = stream_resp.read(32768)
                    if not chunk:
                        break
                    yield chunk
                return
        except Exception:
            continue

@router.get("/stream/{camera_id}")
def stream_camera(
    camera_id: str,
    current_user: User = Depends(get_stream_user)
):
    """
    Proxy camera live stream from Jetson local video feed (port 5001 / 5000) through FastAPI (port 8000).
    Enforces JWT authentication: only authenticated active users can view the stream.
    """
    return StreamingResponse(
        generate_camera_stream(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*"
        }
    )

@router.get("", response_model=list[CameraRead])
def list_cameras(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Camera).all()

@router.post("", response_model=CameraRead, status_code=status.HTTP_201_CREATED)
def create_camera(
    camera_in: CameraCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    existing = db.query(Camera).filter(Camera.camera_code == camera_in.camera_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Camera code already exists")
        
    camera = Camera(**camera_in.model_dump())
    db.add(camera)
    db.commit()
    db.refresh(camera)
    return camera

@router.get("/{camera_id}", response_model=CameraRead)
def get_camera(camera_id: UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    camera = db.query(Camera).filter(Camera.camera_id == camera_id).first()
    if not camera:
        raise HTTPException(status_code=404, detail="Camera not found")
    return camera

