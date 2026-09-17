import logging
import threading
from uuid import UUID
import numpy as np
from sqlalchemy.orm import Session

from app.db.models import Person, FaceEmbedding, IdentityThreshold

logger = logging.getLogger("gallery_manager")


class GalleryManager:
    """
    In-memory embedding gallery manager per Spec Section 12.1:
    - Atomically manages in-memory NumPy matrix of active face embeddings.
    - Builds fresh matrix from PostgreSQL outside lock.
    - Swaps pointer atomically under threading.Lock (microseconds).
    - Zero dropped frames during live inference.
    """
    def __init__(self):
        self._lock = threading.Lock()
        self.embeddings_matrix: np.ndarray = np.empty((0, 512), dtype=np.float32)
        self.person_ids: list[UUID] = []
        self.threshold_table_version: str = "ckpt_w600k_r50_fp16"

    def reload(self, db: Session) -> dict:
        """
        Reloads active identity embeddings into RAM per Spec Section 12.1 and 14.8.
        """
        logger.info("Starting atomic gallery reload from PostgreSQL...")

        # Step 3: Query active embeddings outside lock
        active_items = (
            db.query(FaceEmbedding.person_id, FaceEmbedding.embedding)
            .join(Person, FaceEmbedding.person_id == Person.person_id)
            .filter(Person.status == "active")
            .all()
        )

        new_vecs = []
        new_ids = []
        for pid, raw_bytes in active_items:
            if raw_bytes:
                try:
                    vec = np.frombuffer(raw_bytes, dtype=np.float32)
                    if vec.shape == (512,):
                        # Ensure unit norm: ||v||_2 = 1.0
                        norm = np.linalg.norm(vec)
                        if norm > 0:
                            vec = vec / norm
                        new_vecs.append(vec)
                        new_ids.append(pid)
                except Exception as e:
                    logger.warning(f"Error decoding embedding vector for person {pid}: {e}")

        # Fetch active threshold table version if available
        thresh_rec = (
            db.query(IdentityThreshold.threshold_table_version)
            .order_by(IdentityThreshold.created_at.desc())
            .first()
        )
        table_ver = thresh_rec[0] if thresh_rec else "ckpt_w600k_r50_fp16"

        new_matrix = np.array(new_vecs, dtype=np.float32) if new_vecs else np.empty((0, 512), dtype=np.float32)

        # Step 4: Atomic pointer swap under lock
        with self._lock:
            self.embeddings_matrix = new_matrix
            self.person_ids = new_ids
            self.threshold_table_version = table_ver

        logger.info(
            f"Gallery reloaded successfully: {len(new_ids)} active embeddings "
            f"(matrix shape: {new_matrix.shape}, version: {table_ver})."
        )

        return {
            "status": "reloaded",
            "gallery_size": len(new_ids),
            "threshold_table_version": self.threshold_table_version
        }

    def get_gallery(self):
        with self._lock:
            return self.embeddings_matrix, self.person_ids


# Global singleton instance for the backend process
gallery_state = GalleryManager()