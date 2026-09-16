from uuid import UUID
import urllib.request
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import Camera, User
from app.schemas.camera import CameraCreate, CameraRead
from app.auth.jwt import get_current_user, require_role

router = APIRouter(prefix="/cameras", tags=["Cameras"])

def generate_camera_stream(camera_id: str):
    cid_clean = camera_id.lower().strip()
    if cid_clean in ["camera-0", "camera_0", "0", "csi", "camera_1"]:
        target_cid = "camera_1"
    elif cid_clean in ["camera-1", "camera_2", "1", "rtsp"]:
        target_cid = "camera_2"
    else:
        target_cid = camera_id

    # Try local port 5001 (DeepStream face_api_server), then port 5000 (legacy app.py)
    urls_to_try = [
        f"http://127.0.0.1:5001/video_feed/{target_cid}",
        f"http://127.0.0.1:5000/video_feed/{target_cid}"
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
def stream_camera(camera_id: str):
    """
    Proxy camera live stream from Jetson local video feed (port 5001 / 5000) through FastAPI (port 8000).
    Allows client browsers to receive live feeds without requiring external port 5001 access.
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

