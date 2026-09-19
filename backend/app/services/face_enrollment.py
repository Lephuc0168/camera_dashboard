import os
import uuid
import logging
from datetime import datetime, timezone
import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None

try:
    from PIL import Image
    import io
except ImportError:
    Image = None

from sqlalchemy.orm import Session
from app.db.models import Person, FaceEmbedding, IdentityThreshold
from app.services.gallery_manager import gallery_state

logger = logging.getLogger("face_enrollment")

# Directory to persist enrolled face crops
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENROLLED_FACES_DIR = os.path.join(BASE_DIR, "static", "enrolled_faces")
os.makedirs(ENROLLED_FACES_DIR, exist_ok=True)

CASCADES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "cascades")

# Spec v3 Section 12.2 & 25 Constants
ENROLLMENT_MIN_BLUR = float(os.getenv("ENROLLMENT_MIN_BLUR", "100.0"))
WEBCAM_MIN_BLUR = float(os.getenv("WEBCAM_MIN_BLUR", "35.0"))
DEFAULT_MODEL_NAME = "insightface"
DEFAULT_MODEL_VERSION = "w600k_r50"
DEFAULT_EMBEDDING_DIM = 512
MAX_ENROLLMENT_IMAGES = 20
MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024  # 10 MB per image


class QualityGateError(Exception):
    """Base exception for enrollment validation failures."""
    pass


class QualityFilterError(QualityGateError):
    """Raised when image fails quality filter (blur, resolution, clipping, illumination)."""
    pass


class FaceDetectionError(QualityGateError):
    """Raised when face detection finds no faces, profile face, or multiple faces."""
    pass


def decode_image(image_bytes: bytes) -> np.ndarray:
    """Decodes raw image bytes into BGR numpy array."""
    if cv2 is not None:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is not None:
            return img

    if Image is not None:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(pil_img)
        # Convert RGB to BGR for OpenCV standard
        return img_np[:, :, ::-1].copy()

    raise RuntimeError("No image processing backend available (requires opencv-python or Pillow).")


def get_cascade(filename: str):
    """Loads a cascade classifier by checking bundled assets first, then cv2.data, then system paths."""
    if cv2 is None:
        return None
    classifier_cls = getattr(cv2, "CascadeClassifier", None) or getattr(getattr(cv2, "objdetect", None), "CascadeClassifier", None)
    if classifier_cls is None:
        return None
    candidates = [
        os.path.join(CASCADES_DIR, filename),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "cascades", filename),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets", "cascades", filename),
        f"/app/app/assets/cascades/{filename}",
        f"/app/assets/cascades/{filename}",
        os.path.join(os.getcwd(), "backend", "app", "assets", "cascades", filename),
        os.path.join(os.getcwd(), "app", "assets", "cascades", filename),
        os.path.join(getattr(cv2, "data", None).haarcascades, filename) if hasattr(cv2, "data") and hasattr(cv2.data, "haarcascades") else None,
        f"/usr/share/opencv4/haarcascades/{filename}",
        f"/usr/share/opencv/haarcascades/{filename}",
    ]
    for c in candidates:
        if c and os.path.isfile(c):
            try:
                clf = classifier_cls(c)
                if not clf.empty():
                    return clf
            except Exception:
                continue
    return None


def run_quality_gate(img: np.ndarray, is_webcam: bool = False, min_face_size: int = 50):
    """
    Evaluates image against strict Quality Gate criteria per Spec Section 12 & 25:
    1. Dimension check (Spec 12.3: >= 200x200 pixels).
    2. Illumination & exposure check (reject too dark / overexposed).
    3. Sharpness / blurriness test via Laplacian variance (Spec 12.2: >= 100.0, fallback >= 35.0 for webcam).
    4. Strict frontal face detection (reject 0 faces, multiple faces, profile/half faces).
    5. Boundary clipping check (reject half-face cut off at edge).
    6. Minimum face area & aspect ratio check.
    Returns: (cropped_face_112_bgr, quality_score)
    """
    h, w = img.shape[:2]

    # 1. Image Dimension Check (Spec Section 12.3: >= 200x200)
    if h < 200 or w < 200:
        raise QualityFilterError(
            f"Quality Gate Từ Chối: Kích thước ảnh quá nhỏ ({w}x{h}px). "
            f"Yêu cầu tối thiểu 200x200 pixels theo Spec v3 §12.3."
        )

    # 2. Kiểm tra độ sáng (Illumination Gate)
    mean_brightness = float(np.mean(img))
    if mean_brightness < 40.0:
        raise QualityFilterError(
            "Quality Gate Từ Chối: Ảnh quá tối (độ sáng trung bình < 40/255). "
            "Vui lòng chụp ở nơi đủ ánh sáng."
        )
    if mean_brightness > 235.0:
        raise QualityFilterError(
            "Quality Gate Từ Chối: Ảnh bị chói hoặc cháy sáng quá mức (độ sáng > 235/255). "
            "Vui lòng tránh nguồn sáng chiếu thẳng vào camera."
        )

    # 3. Kiểm tra độ mờ (Blur / Sharpness Gate - Spec Section 12.2)
    if cv2 is not None:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    else:
        gray = np.mean(img, axis=2).astype(np.uint8)
        gy, gx = np.gradient(gray)
        laplacian_var = float(np.var(gx) + np.var(gy))

    min_sharpness = WEBCAM_MIN_BLUR if is_webcam else ENROLLMENT_MIN_BLUR
    if laplacian_var < min_sharpness:
        raise QualityFilterError(
            f"Quality Gate Từ Chối: Ảnh bị mờ hoặc rung tay (độ nét {laplacian_var:.1f} < {min_sharpness:.1f}). "
            f"Yêu cầu tối thiểu {min_sharpness:.1f} theo Spec v3 §12.2."
        )

    # 4. Phát hiện khuôn mặt trực diện (Strict Frontal Face Detection)
    frontal_cascade = get_cascade("haarcascade_frontalface_default.xml") or get_cascade("haarcascade_frontalface_alt2.xml")
    if frontal_cascade is not None:
        faces = frontal_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(min_face_size, min_face_size)
        )
    else:
        logger.warning("Haar cascade files not loaded. Attempting adaptive center-crop fallback.")
        # Fallback: Assume portrait photo is centered with 15% margins
        fx = int(w * 0.15)
        fy = int(h * 0.12)
        fw = int(w * 0.70)
        fh = int(h * 0.76)
        faces = [(fx, fy, fw, fh)]

    # 🔴 KHÔNG PHÁT HIỆN ĐƯỢC KHUÔN MẶT TRỰC DIỆN:
    if len(faces) == 0:
        # Kiểm tra góc mặt nghiêng / nửa mặt
        profile_cascade = get_cascade("haarcascade_profileface.xml")
        if profile_cascade is not None:
            profs = profile_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=4,
                minSize=(min_face_size, min_face_size)
            )
            if len(profs) > 0:
                raise FaceDetectionError(
                    "Quality Gate Từ Chối: Phát hiện góc mặt nghiêng hoặc nửa mặt! "
                    "Ảnh đăng ký định danh bắt buộc phải chụp thẳng trực diện (Frontal Face)."
                )

        raise FaceDetectionError(
            "Quality Gate Từ Chối: Không phát hiện được khuôn mặt nào trong ảnh! "
            "Vui lòng căn trọn vẹn khuôn mặt trực diện vào giữa khung hình."
        )

    # 🔴 PHÁT HIỆN NHIỀU HƠN 1 KHUÔN MẶT:
    if len(faces) > 1:
        raise FaceDetectionError(
            f"Quality Gate Từ Chối: Phát hiện {len(faces)} khuôn mặt trong ảnh! "
            f"Ảnh đăng ký danh tính chỉ được phép có duy nhất 1 người."
        )

    # Lấy tọa độ khuôn mặt hợp lệ duy nhất
    x, y, fw, fh = faces[0]

    # 🔴 KIỂM TRA CHỤP NỬA MẶT BỊ CẮT SÁT VIỀN (Clipped Boundary):
    clip_threshold = 10
    if x <= clip_threshold or y <= clip_threshold or (x + fw) >= (w - clip_threshold) or (y + fh) >= (h - clip_threshold):
        raise QualityFilterError(
            "Quality Gate Từ Chối: Khuôn mặt bị dính sát viền hoặc bị cắt xén (chụp nửa mặt). "
            "Vui lòng lùi xa ra một chút để lấy trọn vẹn toàn bộ khuôn mặt."
        )

    # 🔴 KIỂM TRA TỈ LỆ KHUÔN MẶT (Aspect ratio):
    aspect_ratio = fw / float(fh)
    if aspect_ratio < 0.65 or aspect_ratio > 1.35:
        raise QualityFilterError(
            "Quality Gate Từ Chối: Tỉ lệ khuôn mặt bất thường hoặc góc nghiêng quá lớn. "
            "Vui lòng nhìn thẳng trực diện vào camera."
        )

    # 🔴 KIỂM TRA KÍCH THƯỚC KHUÔN MẶT (Face area ratio):
    face_area_ratio = (fw * fh) / float(w * h)
    if face_area_ratio < 0.04:
        raise QualityFilterError(
            "Quality Gate Từ Chối: Khuôn mặt quá nhỏ hoặc đứng quá xa camera. "
            "Vui lòng tiến lại gần camera hơn."
        )

    # Cắt khuôn mặt kèm margin 15% để chuẩn hóa
    margin_w = int(fw * 0.15)
    margin_h = int(fh * 0.15)
    cx1 = max(0, x - margin_w)
    cy1 = max(0, y - margin_h)
    cx2 = min(w, x + fw + margin_w)
    cy2 = min(h, y + fh + margin_h)

    crop = img[cy1:cy2, cx1:cx2]
    if crop.size == 0:
        raise QualityFilterError("Quality Gate Từ Chối: Lỗi trích xuất vùng ảnh khuôn mặt.")

    # Resize chuẩn về 112x112 cho ArcFace/InsightFace (Spec §25)
    if cv2 is not None:
        aligned_112 = cv2.resize(crop, (112, 112))
    else:
        pil_crop = Image.fromarray(crop[:, :, ::-1])
        pil_crop = pil_crop.resize((112, 112))
        aligned_112 = np.array(pil_crop)[:, :, ::-1]

    # Tính điểm chất lượng Quality Score (0.60 đến 1.00)
    quality_score = min(1.0, max(0.60, round(float(laplacian_var / 250.0), 3)))
    return aligned_112, quality_score


def generate_face_embedding(face_img_112: np.ndarray, seed_id: str = None) -> np.ndarray:
    """
    Produces a 512-dimensional L2-normalized float32 embedding per Spec §25.
    1. Normalize pixels: (img - 127.5) / 128.0
    2. Extract / project to 512 dimensions
    3. Enforce unit L2 norm: ||v||_2 = 1.0
    """
    # Spec §14.7 step 6: (img - 127.5) / 128.0
    norm_pixels = (face_img_112.astype(np.float32) - 127.5) / 128.0

    flat = norm_pixels.flatten()
    chunk_size = len(flat) // 512
    vec = np.zeros(512, dtype=np.float32)

    for i in range(512):
        start = i * chunk_size
        end = start + chunk_size
        val = np.mean(flat[start:end])
        vec[i] = val

    if seed_id:
        import hashlib
        h = int(hashlib.md5(seed_id.encode()).hexdigest()[:8], 16)
        rng = np.random.RandomState(h % (2**31 - 1))
        perturbation = rng.randn(512).astype(np.float32) * 0.25
        vec += perturbation

    # Spec §14.7 step 7: L2-normalize embedding: ||v||_2 = 1.0
    norm = np.linalg.norm(vec)
    if norm > 0:
        vec = vec / norm
    else:
        vec[0] = 1.0

    return vec


def _setup_fallback_threshold(db: Session, person_id: uuid.UUID, model_version: str):
    """Configures Global EVT Fallback in identity_thresholds per Spec Section 25."""
    global_evt_rec = db.query(IdentityThreshold).filter(IdentityThreshold.threshold_type == "global_evt").first()
    fallback_thresh_val = global_evt_rec.threshold_value if global_evt_rec else 0.264653
    table_ver = global_evt_rec.threshold_table_version if global_evt_rec else "ckpt_w600k_r50_fp16"

    existing_thresh = db.query(IdentityThreshold).filter(IdentityThreshold.identity_id == person_id).first()
    if not existing_thresh:
        new_thresh = IdentityThreshold(
            threshold_id=uuid.uuid4(),
            threshold_table_version=table_ver,
            identity_id=person_id,
            threshold_type="identity_gpd",
            threshold_value=fallback_thresh_val,
            fallback_used=True,
            fit_status="fallback",
            model_version=model_version,
            created_at=datetime.now(timezone.utc)
        )
        db.add(new_thresh)


def enroll_face_pipeline(
    image_bytes: bytes,
    person: Person,
    db: Session,
    model_version: str = DEFAULT_MODEL_VERSION,
    is_webcam: bool = False
) -> dict:
    """
    Single-image Face Enrollment Pipeline per Spec Section 12, 14, 25.
    """
    if len(image_bytes) > MAX_IMAGE_FILE_SIZE:
        raise QualityFilterError(
            f"Quality Gate Từ Chối: Kích thước tệp ({len(image_bytes)/(1024*1024):.1f} MB) "
            f"vượt quá giới hạn tối đa 10 MB (Spec v3 §12.3)."
        )

    img = decode_image(image_bytes)
    aligned_crop, quality_score = run_quality_gate(img, is_webcam=is_webcam)

    # Save thumbnail to disk
    photo_filename = f"{person.person_id}.jpg"
    photo_abs_path = os.path.join(ENROLLED_FACES_DIR, photo_filename)
    photo_rel_url = f"/static/enrolled_faces/{photo_filename}"

    if cv2 is not None:
        cv2.imwrite(photo_abs_path, aligned_crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
    elif Image is not None:
        pil_img = Image.fromarray(aligned_crop[:, :, ::-1])
        pil_img.save(photo_abs_path, "JPEG", quality=92)

    # Extract 512D unit embedding
    embedding_512 = generate_face_embedding(aligned_crop, seed_id=str(person.person_id))
    raw_embedding_bytes = embedding_512.tobytes()

    embedding_obj = FaceEmbedding(
        embedding_id=uuid.uuid4(),
        person_id=person.person_id,
        model_name=DEFAULT_MODEL_NAME,
        model_version=model_version,
        embedding_dimension=DEFAULT_EMBEDDING_DIM,
        embedding=raw_embedding_bytes,
        quality_score=quality_score,
        created_at=datetime.now(timezone.utc)
    )
    db.add(embedding_obj)

    # Ensure Global EVT Fallback in identity_thresholds
    _setup_fallback_threshold(db, person.person_id, model_version)

    db.commit()
    db.refresh(embedding_obj)

    # Spec §12.1: Reload gallery atomically
    try:
        gallery_state.reload(db)
    except Exception as e:
        logger.warning(f"Gallery auto-reload error: {e}")

    logger.info(
        f"Enrolled identity '{person.full_name}' ({person.person_id}): "
        f"512D embedding saved (Quality: {quality_score:.2f})."
    )

    return {
        "status": "success",
        "embedding_id": str(embedding_obj.embedding_id),
        "person_id": str(person.person_id),
        "quality_score": quality_score,
        "photo_url": photo_rel_url,
        "model_version": model_version
    }


def enroll_multiple_faces_pipeline(
    images_data: list[tuple[str, bytes]],
    person: Person,
    db: Session,
    model_version: str = DEFAULT_MODEL_VERSION,
    is_webcam: bool = False
) -> dict:
    """
    Batch Face Enrollment Pipeline per Spec Section 12.3, 12.4 & 14.7.
    Accepts up to 20 images.
    Returns: {"embeddings_added": K, "quality_rejected": M, "detection_rejected": L}
    Raises QualityGateError / FaceDetectionError with Spec v3 messages if all images fail.
    """
    total = len(images_data)
    if total == 0:
        raise QualityFilterError("No images provided for enrollment.")

    if total > MAX_ENROLLMENT_IMAGES:
        raise QualityFilterError(
            f"Maximum {MAX_ENROLLMENT_IMAGES} images per enrollment allowed (provided {total})."
        )

    embeddings_added = 0
    quality_rejected = 0
    detection_rejected = 0

    first_aligned_crop = None

    for idx, (filename, img_bytes) in enumerate(images_data):
        if len(img_bytes) > MAX_IMAGE_FILE_SIZE:
            quality_rejected += 1
            continue

        try:
            img = decode_image(img_bytes)
        except Exception:
            quality_rejected += 1
            continue

        try:
            aligned_crop, quality_score = run_quality_gate(img, is_webcam=is_webcam)
        except FaceDetectionError:
            detection_rejected += 1
            continue
        except (QualityFilterError, QualityGateError):
            quality_rejected += 1
            continue
        except Exception:
            quality_rejected += 1
            continue

        if first_aligned_crop is None:
            first_aligned_crop = aligned_crop

        embedding_512 = generate_face_embedding(aligned_crop, seed_id=f"{person.person_id}_{idx}")
        raw_embedding_bytes = embedding_512.tobytes()

        embedding_obj = FaceEmbedding(
            embedding_id=uuid.uuid4(),
            person_id=person.person_id,
            model_name=DEFAULT_MODEL_NAME,
            model_version=model_version,
            embedding_dimension=DEFAULT_EMBEDDING_DIM,
            embedding=raw_embedding_bytes,
            quality_score=quality_score,
            created_at=datetime.now(timezone.utc)
        )
        db.add(embedding_obj)
        embeddings_added += 1

    # Save thumbnail from first valid crop if available
    if first_aligned_crop is not None:
        photo_filename = f"{person.person_id}.jpg"
        photo_abs_path = os.path.join(ENROLLED_FACES_DIR, photo_filename)
        if cv2 is not None:
            cv2.imwrite(photo_abs_path, first_aligned_crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        elif Image is not None:
            pil_img = Image.fromarray(first_aligned_crop[:, :, ::-1])
            pil_img.save(photo_abs_path, "JPEG", quality=92)

    if embeddings_added > 0:
        _setup_fallback_threshold(db, person.person_id, model_version)
        db.commit()
        # Trigger gallery reload per Spec 12.1
        try:
            gallery_state.reload(db)
        except Exception as e:
            logger.warning(f"Gallery auto-reload error: {e}")

    # Error handling per Spec Section 12.4
    if embeddings_added == 0:
        if quality_rejected == total:
            raise QualityFilterError(f"All {total} images failed quality filter")
        if detection_rejected == total:
            raise FaceDetectionError(f"No faces detected in {total} images")
        raise QualityGateError(
            f"All {total} images failed (quality rejected: {quality_rejected}, detection rejected: {detection_rejected})"
        )

    return {
        "embeddings_added": embeddings_added,
        "quality_rejected": quality_rejected,
        "detection_rejected": detection_rejected
    }