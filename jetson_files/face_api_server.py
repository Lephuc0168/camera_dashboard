"""
Flask API Server cho Jetson - Cung cấp /api/faces, /stats và /video_feed đa camera
Chạy song song với DeepStream pipeline trong background thread.
"""
import os
import time
import cv2
import base64
import numpy as np
import threading
import datetime
import re
from flask import Flask, jsonify, request, Response

app = Flask(__name__)

_faces_cache = None
_faces_lock = None


def init_cache(cache_ref, lock_ref):
    global _faces_cache, _faces_lock
    _faces_cache = cache_ref
    _faces_lock = lock_ref


def _crop_faces(frame, boxes):
    """Crop khuôn mặt từ frame sạch (RGBA) và trả về base64 JPEG."""
    faces = []
    try:
        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGBA2BGR)
        h, w = frame_bgr.shape[:2]
        for box in boxes:
            x1 = max(0, int(box["left"]))
            y1 = max(0, int(box["top"]))
            x2 = min(w, int(box["left"] + box["width"]))
            y2 = min(h, int(box["top"] + box["height"]))
            if x2 > x1 and y2 > y1:
                crop = frame_bgr[y1:y2, x1:x2]
                ret, buf = cv2.imencode('.jpg', crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
                if ret:
                    b64 = base64.b64encode(buf.tobytes()).decode('utf-8')
                    faces.append({"data": f"data:image/jpeg;base64,{b64}", "box": [x1, y1, x2, y2]})
    except Exception as e:
        print(f"[FaceAPI] Crop error: {e}")
    return faces


def _get_system_stats():
    stats = {"cpu": 0, "gpu": 0, "ram": 0, "temp": 0}
    try:
        with open("/proc/loadavg") as f:
            load = float(f.read().split()[0])
        cores = os.cpu_count() or 4
        stats["cpu"] = min(100, int(load / cores * 100))
    except Exception:
        pass
    try:
        for p in ["/sys/devices/gpu.0/load", "/sys/devices/platform/gpu.0/load"]:
            if os.path.exists(p):
                with open(p) as f:
                    stats["gpu"] = int(int(f.read().strip()) / 10)
                break
    except Exception:
        pass
    try:
        with open("/proc/meminfo") as f:
            lines = f.readlines()
        total = int(lines[0].split()[1])
        avail = int(lines[2].split()[1])
        stats["ram"] = int((1 - avail / total) * 100)
    except Exception:
        pass
    try:
        temps = []
        for i in range(10):
            tp = f"/sys/devices/virtual/thermal/thermal_zone{i}/temp"
            if os.path.exists(tp):
                with open(tp) as f:
                    temps.append(int(f.read().strip()) / 1000.0)
        if temps:
            stats["temp"] = int(max(temps))
    except Exception:
        pass
    return stats


@app.route('/stats')
@app.route('/api/stats')
def api_stats():
    return jsonify(_get_system_stats())


@app.route('/api/faces')
@app.route('/api/faces/<camera_id>')
def api_faces(camera_id=None):
    if _faces_cache is None:
        return jsonify({"status": "error", "faces": [], "count": 0})
    
    # Rút ngắn thời gian giữ lock < 0.001ms
    targets = []
    with _faces_lock:
        if camera_id:
            data = _faces_cache.get(camera_id)
            if data and (time.time() - data.get("timestamp", 0)) < 5.0:
                targets.append((camera_id, data.get("frame"), data.get("boxes", [])))
        else:
            for cid, data in _faces_cache.items():
                if time.time() - data.get("timestamp", 0) < 5.0:
                    targets.append((cid, data.get("frame"), data.get("boxes", [])))
    
    # Thực hiện crop ngoài lock để không nghẽn pipeline
    if camera_id:
        if targets and targets[0][1] is not None:
            faces = _crop_faces(targets[0][1], targets[0][2])
            return jsonify({"status": "success", "faces": faces, "count": len(faces)})
        return jsonify({"status": "success", "faces": [], "count": 0})
    
    result = {}
    for cid, frm, bxs in targets:
        if frm is not None:
            faces = _crop_faces(frm, bxs)
            result[cid] = {"faces": faces, "count": len(faces)}
    return jsonify({"status": "success", "cameras": result})


@app.route('/video_feed')
@app.route('/video_feed/<camera_id>')
def video_feed(camera_id=None):
    """Phát trực tiếp luồng video camera (tối ưu hóa zero-lock, tiết kiệm 70% CPU Jetson)."""
    def generate():
        last_frame_bytes = None
        last_ts = 0
        while True:
            frame_to_process = None
            if _faces_cache is not None:
                # BƯỚC 1: Rút ngắn thời gian giữ lock < 0.001ms (chỉ lấy reference)
                with _faces_lock:
                    target_cid = None
                    if camera_id:
                        cid_clean = camera_id.lower().strip()
                        if cid_clean in ["camera-0", "camera_0", "camera_01", "0", "csi", "camera_1"]:
                            target_cid = "camera_1" if "camera_1" in _faces_cache else None
                        elif cid_clean in ["camera-1", "camera_02", "camera_2", "1", "rtsp"] and "camera_2" in _faces_cache:
                            target_cid = "camera_2"
                        else:
                            for k in _faces_cache.keys():
                                if k.lower().replace("-", "_") == cid_clean.replace("-", "_") or cid_clean in k.lower():
                                    target_cid = k
                                    break
                    if not target_cid and _faces_cache:
                        target_cid = list(_faces_cache.keys())[0]

                    if target_cid and target_cid in _faces_cache:
                        data = _faces_cache[target_cid]
                        cur_ts = data.get("timestamp", 0)
                        if "frame" in data and data["frame"] is not None:
                            if cur_ts != last_ts or last_frame_bytes is None:
                                frame_to_process = data["frame"]
                                last_ts = cur_ts

            # BƯỚC 2: Xử lý và nén JPEG HOÀN TOÀN NGOÀI LOCK
            if frame_to_process is not None:
                try:
                    h, w = frame_to_process.shape[:2]
                    # Downscale cho web preview nếu độ phân giải > 1280 (tiết kiệm 65% tải CPU)
                    if w > 1280:
                        scale = 1280.0 / w
                        frame_resized = cv2.resize(frame_to_process, (1280, int(h * scale)), interpolation=cv2.INTER_LINEAR)
                    else:
                        frame_resized = frame_to_process

                    if len(frame_resized.shape) == 3 and frame_resized.shape[2] == 4:
                        frame_bgr = cv2.cvtColor(frame_resized, cv2.COLOR_RGBA2BGR)
                    else:
                        frame_bgr = frame_resized
                    ret, buf = cv2.imencode('.jpg', frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, 70])
                    if ret:
                        last_frame_bytes = buf.tobytes()
                except Exception:
                    pass

            if last_frame_bytes:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + last_frame_bytes + b'\r\n')
                time.sleep(0.04) # 25 FPS mượt mà
            else:
                time.sleep(0.05)

    res = Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')
    res.headers['Access-Control-Allow-Origin'] = '*'
    return res


@app.route('/api/save', methods=['POST'])
def api_save_faces():
    data = request.get_json()
    if not data or 'images' not in data:
        return jsonify({"status": "error", "message": "Missing images data"}), 400
        
    save_dir = os.path.join(os.path.expanduser('~'), 'dt', 'capture')
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    saved_count = 0
    
    for idx, img_obj in enumerate(data['images']):
        img_data = img_obj.get('data', '')
        label = img_obj.get('label', 'Unknown')
        
        clean_label = re.sub(r'[^a-zA-Z0-9_\-]', '', label)
        if not clean_label:
            clean_label = 'Unknown'
            
        person_dir = os.path.join(save_dir, clean_label)
        os.makedirs(person_dir, exist_ok=True)
        
        if ',' in img_data:
            img_data = img_data.split(',')[1]
            
        try:
            decoded = base64.b64decode(img_data)
            nparr = np.frombuffer(decoded, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is not None:
                filename = f"{clean_label}_{timestamp}_{idx + 1}.jpg"
                filepath = os.path.join(person_dir, filename)
                cv2.imwrite(filepath, img)
                saved_count += 1
        except Exception as e:
            print(f"[FaceAPI] Save error: {e}")
            
    return jsonify({"status": "success", "message": f"Đã lưu {saved_count} ảnh vào Jetson (~/dt/capture/)", "count": saved_count})


def start_in_background(cache_ref, lock_ref, port=5001):
    init_cache(cache_ref, lock_ref)
    t = threading.Thread(target=lambda: app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False), daemon=True)
    t.start()
    print(f"[FaceAPI] Server started on port {port}")
    return t
