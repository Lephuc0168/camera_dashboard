import os, sys, numpy as np, ctypes as ct
import time
import threading
from pathlib import Path

import pyds
from gi.repository import Gst; PROBE_OK = Gst.PadProbeReturn.OK
from src.gallery.faiss_manager import FaissGallery

# ==========================================
# GLOBAL FACE CACHE
# ==========================================
_faces_lock = threading.Lock()
_faces_cache = {}


def get_faces_cache():
    return _faces_cache, _faces_lock


class FaceRecognizer:
    def __init__(self, full_config, project_root, camera_id="camera_1"):
        self.config = full_config
        self.project_root = project_root
        self.camera_id = camera_id
        emb_cfg = self.config.get("models",{}).get("embedding",{})
        gal_cfg = self.config.get("gallery",{})
        self.embedding_size = emb_cfg.get("embedding_size", 512)
        self.faiss_path = str(self.project_root / gal_cfg.get("faiss_index_path","data/gallerry/known_embeddings.faiss"))
        self.labels_path = str(self.project_root / gal_cfg.get("labels_path","data/gallerry/known_embeddings.npz"))
        self.similarity_threshold = gal_cfg.get("similarity_threshold", 0.6)
        self.gallery = None
        self.frame_count = 0

    def load(self):
        try:
            self.gallery = FaissGallery(self.faiss_path, self.labels_path, self.similarity_threshold, self.embedding_size)
            return True
        except Exception as e:
            print(f"[FaceRecognizer] Load failed: {e}")
            return False

    def probe_callback(self, pad, info, u_data=None):
        """Probe trên infer src pad - chỉ xử lý metadata + cache bounding boxes."""
        self.frame_count += 1
        dbg = (self.frame_count % 300 == 0)
        try:
            gst_buffer = info.get_buffer()
            if not gst_buffer: return PROBE_OK
            batch_meta = pyds.gst_buffer_get_nvds_batch_meta(hash(gst_buffer))
            l_frame = batch_meta.frame_meta_list
            while l_frame is not None:
                try: frame_meta = pyds.NvDsFrameMeta.cast(l_frame.data)
                except StopIteration: break

                embedding = self._read_frame_tensor_gie2(frame_meta.frame_user_meta_list)

                detected_boxes = []
                l_obj = frame_meta.obj_meta_list; num_objs = 0
                while l_obj is not None:
                    try: obj_meta = pyds.NvDsObjectMeta.cast(l_obj.data)
                    except StopIteration: break
                    num_objs += 1

                    rect = obj_meta.rect_params
                    detected_boxes.append({
                        "left": rect.left, "top": rect.top,
                        "width": rect.width, "height": rect.height
                    })

                    if embedding is not None:
                        label, idx, score = self.gallery.search(embedding)
                        txt = "%s (%.2f)" % (label, score) if label else "Unknown (%.2f)" % score
                        obj_meta.text_params.display_text = txt
                        obj_meta.text_params.font_params.font_size = 12
                    try: l_obj = l_obj.next
                    except StopIteration: break

                # Cache bounding boxes only (frame cached by frame_probe_callback)
                if len(detected_boxes) > 0 and self.frame_count % 3 == 0:
                    with _faces_lock:
                        entry = _faces_cache.get(self.camera_id, {})
                        entry["boxes"] = detected_boxes
                        entry["timestamp"] = time.time()
                        _faces_cache[self.camera_id] = entry

                if dbg and num_objs > 0:
                    print("[FaceRecognizer] Frame %d, Objects: %d, Embedding: %s" % (
                        self.frame_count, num_objs, "YES" if embedding is not None else "NO"))
                try: l_frame = l_frame.next
                except StopIteration: break
        except Exception as e:
            if dbg: print("[FaceRecognizer] Error: %s" % e)
        return PROBE_OK

    def frame_probe_callback(self, pad, info, u_data=None):
        """Probe trên nvvideoconvert src - frame RGBA sạch, chưa vẽ OSD."""
        if self.frame_count % 3 != 0:
            return PROBE_OK
        try:
            gst_buffer = info.get_buffer()
            if not gst_buffer: return PROBE_OK
            batch_meta = pyds.gst_buffer_get_nvds_batch_meta(hash(gst_buffer))
            l_frame = batch_meta.frame_meta_list
            if l_frame:
                frame_meta = pyds.NvDsFrameMeta.cast(l_frame.data)
                n_frame = pyds.get_nvds_buf_surface(hash(gst_buffer), frame_meta.batch_id)
                frame_copy = np.array(n_frame, copy=True, order='C')
                with _faces_lock:
                    entry = _faces_cache.get(self.camera_id, {})
                    entry["frame"] = frame_copy
                    _faces_cache[self.camera_id] = entry
        except Exception as e:
            if self.frame_count % 300 == 0:
                print(f"[FaceRecognizer:{self.camera_id}] Frame probe error: {e}")
        return PROBE_OK

    def _read_frame_tensor_gie2(self, l_user):
        while l_user is not None:
            try: user_meta = pyds.NvDsUserMeta.cast(l_user.data)
            except StopIteration: break
            try:
                if user_meta.base_meta.meta_type == pyds.NVDSINFER_TENSOR_OUTPUT_META:
                    tm = pyds.NvDsInferTensorMeta.cast(user_meta.user_meta_data)
                    if tm.unique_id == 2:
                        for i in range(tm.num_output_layers):
                            li = pyds.get_nvds_LayerInfo(tm, i)
                            if li and li.buffer:
                                n = 1
                                for d in range(li.dims.numDims): n *= li.dims.d[d]
                                ptr = pyds.get_ptr(li.buffer) if hasattr(pyds,"get_ptr") else hash(li.buffer)
                                data = np.ctypeslib.as_array(ct.cast(ct.c_void_p(ptr), ct.POINTER(ct.c_float)), shape=(n,)).copy()
                                return data
            except Exception:
                pass
            try: l_user = l_user.next
            except StopIteration: break
        return None
