import cv2
from flask import Flask, render_template, Response, jsonify, request
import os
import base64
import datetime
import time
import threading
import subprocess
import re
import urllib.request
import json
import numpy as np
import onnxruntime as ort

app = Flask(__name__)

# ==========================================
# CẤU HÌNH CÁC NGUỒN VIDEO (HỖ TRỢ 4 CAMERA)
# ==========================================
VIDEO_SOURCES = {
    "camera_1": "udp://@:5005?fifo_size=5000000&overrun_nonfatal=1",
    "camera_2": "udp://@:5006?fifo_size=5000000&overrun_nonfatal=1"
}

# Lưu frame mới nhất của từng camera để chụp ảnh độc lập
latest_frames = {cam_id: None for cam_id in VIDEO_SOURCES}

# Lưu trữ chỉ số Benchmark thực tế
camera_stats = {
    cam_id: {
        "fps": 0,
        "resolution": "Unknown",
        "status": "Offline"
    } for cam_id in VIDEO_SOURCES
}

jetson_system_stats = {
    "cpu": 0,
    "gpu": 0,
    "ram": 0,
    "temp": 0,
    "latency": 0,
    "online": False
}

stats_lock = threading.Lock()

# Tải mô hình phát hiện khuôn mặt ONNX
ort_session = None
try:
    # Sử dụng CPU Execution Provider để chạy suy luận ổn định trên máy chủ
    # Dùng detection_fixed.onnx đã được trích xuất các layer trung gian để tránh bug nén lượng hóa (quantization bug)
    ort_session = ort.InferenceSession("detection_fixed.onnx", providers=['CPUExecutionProvider'])
    print("[+] Loaded face detection model detection_fixed.onnx successfully!")
except Exception as e:
    print(f"[-] Failed to load face detection model: {e}")

def detect_faces(image, conf_threshold=0.2, iou_threshold=0.45):
    """
    Phát hiện các khuôn mặt trong ảnh bằng mô hình YOLOv8 ONNX.
    Trả về danh sách các bounding boxes dạng [x1, y1, x2, y2] theo kích thước gốc của ảnh.
    """
    if ort_session is None:
        return []
        
    h_orig, w_orig = image.shape[:2]
    
    # Tiền xử lý ảnh cho YOLOv8 (640x640, BGR, normalize 1/255)
    img_resized = cv2.resize(image, (640, 640))
    img_input = img_resized.astype(np.float32) / 255.0
    img_input = np.transpose(img_input, (2, 0, 1))
    img_input = np.expand_dims(img_input, axis=0)
    
    try:
        # Chạy inference lấy output trung gian để tránh bug lượng hóa làm mất confidence score của YOLOv8
        output_names = [
            '/model.23/Mul_2_output_0_DequantizeLinear_Output',
            '/model.23/Sigmoid_output_0_DequantizeLinear_Output'
        ]
        outputs = ort_session.run(output_names, {"images": img_input})
        boxes_tensor = outputs[0][0]  # shape (4, 8400)
        scores_tensor = outputs[1][0] # shape (1, 8400)
        
        boxes = []
        confidences = []
        
        for idx in range(8400):
            confidence = scores_tensor[0, idx]
            if confidence >= conf_threshold:
                x_center, y_center, width, height = boxes_tensor[:, idx]
                
                # Chuyển về tọa độ x, y, w, h
                x = x_center - width / 2
                y = y_center - height / 2
                
                # Map về kích thước ảnh gốc
                x_scaled = int(x * w_orig / 640.0)
                y_scaled = int(y * h_orig / 640.0)
                w_scaled = int(width * w_orig / 640.0)
                h_scaled = int(height * h_orig / 640.0)
                
                boxes.append([x_scaled, y_scaled, w_scaled, h_scaled])
                confidences.append(float(confidence))
                
        if len(boxes) == 0:
            return []
            
        # Áp dụng NMS (Non-Maximum Suppression) để loại bỏ các ô trùng lặp
        indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_threshold, iou_threshold)
        
        final_boxes = []
        if len(indices) > 0:
            if isinstance(indices, np.ndarray):
                indices = indices.flatten()
            for idx in indices:
                x, y, w, h = boxes[idx]
                x1 = max(0, x)
                y1 = max(0, y)
                x2 = min(w_orig, x + w)
                y2 = min(h_orig, y + h)
                
                if x2 > x1 and y2 > y1:
                    final_boxes.append([x1, y1, x2, y2])
                    
        return final_boxes
    except Exception as e:
        print(f"[-] Inference error: {e}")
        return []

def update_jetson_stats_loop():
    global jetson_system_stats
    import platform
    
    # Lệnh ping thích hợp cho Windows hoặc Linux
    ping_cmd = ["ping", "-n", "1", "192.168.31.102"] if platform.system().lower() == "windows" else ["ping", "-c", "1", "192.168.31.102"]
    
    while True:
        # 1. Đo độ trễ ping
        latency = 0
        try:
            res = subprocess.run(ping_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1.0)
            if res.returncode == 0:
                match = re.search(r"Average = (\d+)ms|time=(\d+\.?\d*)ms", res.stdout, re.IGNORECASE)
                if match:
                    latency = int(match.group(1) or match.group(2))
        except Exception:
            pass
            
        # 2. Lấy thông số từ API Jetson (port 5001)
        jetson_data = {"cpu": 0, "gpu": 0, "ram": 0, "temp": 0}
        online = False
        try:
            req = urllib.request.Request("http://192.168.31.102:5001/stats")
            with urllib.request.urlopen(req, timeout=1.0) as response:
                if response.status == 200:
                    jetson_data = json.loads(response.read().decode('utf-8'))
                    online = True
        except Exception:
            pass
            
        with stats_lock:
            jetson_system_stats.update(jetson_data)
            jetson_system_stats["latency"] = latency
            jetson_system_stats["online"] = online
            
        time.sleep(2.0)

# Khởi chạy thread giám sát ngầm
t = threading.Thread(target=update_jetson_stats_loop, daemon=True)
t.start()

# Caches và khóa tương ứng phục vụ cơ chế xử lý không đồng bộ
latest_frames = {cam_id: None for cam_id in VIDEO_SOURCES}       # Chứa frame có vẽ khung đỏ (để phát stream)
clean_frames = {cam_id: None for cam_id in VIDEO_SOURCES}        # Chứa frame sạch (để chụp và trích xuất khuôn mặt)

frame_locks = {cam_id: threading.Lock() for cam_id in VIDEO_SOURCES}
clean_frame_locks = {cam_id: threading.Lock() for cam_id in VIDEO_SOURCES}

def camera_reader_loop(camera_id):
    global clean_frames, camera_stats, latest_frames
    source = VIDEO_SOURCES[camera_id]
    
    while True:
        with stats_lock:
            camera_stats[camera_id]["status"] = "Connecting"
            camera_stats[camera_id]["fps"] = 0
            
        print(f"[*] Background: Connecting to {camera_id}: {source}...")
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        
        if not cap.isOpened():
            print(f"[-] Background: Failed to connect to {camera_id}. Retrying in 2s...")
            with stats_lock:
                camera_stats[camera_id]["status"] = "Offline"
            cap.release()
            time.sleep(2)
            continue
            
        print(f"[+] Background: Successfully connected to {camera_id}!")
        
        # Biến tính toán FPS thực tế
        fps_start_time = time.time()
        fps_counter = 0
        
        while True:
            success, frame = cap.read()
            if not success:
                print(f"[-] Background: Disconnected or lost stream from {camera_id}. Reconnecting...")
                with stats_lock:
                    camera_stats[camera_id]["status"] = "Offline"
                    camera_stats[camera_id]["fps"] = 0
                break
                
            fps_counter += 1
            elapsed = time.time() - fps_start_time
            if elapsed >= 1.0:
                current_fps = int(fps_counter / elapsed)
                h, w = frame.shape[:2]
                with stats_lock:
                    camera_stats[camera_id]["status"] = "Online"
                    camera_stats[camera_id]["fps"] = current_fps
                    camera_stats[camera_id]["resolution"] = f"{w}x{h}"
                fps_counter = 0
                fps_start_time = time.time()
                
            # Lưu frame sạch vào bộ nhớ cache riêng biệt
            with clean_frame_locks[camera_id]:
                clean_frames[camera_id] = frame.copy()
                
            # Copy trực tiếp sang display cache để truyền phát luồng (camera đã tự vẽ khung đỏ sẵn)
            with frame_locks[camera_id]:
                latest_frames[camera_id] = frame.copy()
                    
            time.sleep(0.01)
            
        cap.release()
        time.sleep(1)

# Khởi chạy các thread đọc camera chạy ngầm
for cam_id in VIDEO_SOURCES:
    t_cam = threading.Thread(target=camera_reader_loop, args=(cam_id,), daemon=True)
    t_cam.start()

def generate_frames(camera_id):
    global latest_frames
    
    if camera_id not in VIDEO_SOURCES:
        return
        
    while True:
        frame = None
        with frame_locks[camera_id]:
            if latest_frames[camera_id] is not None:
                frame = latest_frames[camera_id].copy()
                
        if frame is None:
            time.sleep(0.1)
            continue
            
        # Mã hóa frame sang định dạng JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            time.sleep(0.03)
            continue
        frame_bytes = buffer.tobytes()
        
        # Trả về luồng byte MJPEG cho trình duyệt
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        time.sleep(0.03)

@app.route('/api/stats')
def get_stats():
    with stats_lock:
        return jsonify({
            "cameras": camera_stats,
            "jetson": jetson_system_stats
        })

@app.route('/')
def index():
    # Render giao diện từ file templates/index.html
    return render_template('index.html')

@app.route('/video_feed')
@app.route('/video_feed/<camera_id>')
def video_feed(camera_id="camera_1"):
    if camera_id not in VIDEO_SOURCES:
        return "Camera not found", 404
    return Response(generate_frames(camera_id), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/capture', methods=['POST'])
def capture_default():
    # Mặc định chụp camera 1
    return capture("camera_1")

@app.route('/capture/<camera_id>', methods=['POST'])
def capture(camera_id):
    global clean_frames
    clean_frame = None
    with clean_frame_locks[camera_id]:
        if camera_id in clean_frames and clean_frames[camera_id] is not None:
            clean_frame = clean_frames[camera_id].copy()
            
    if clean_frame is None:
        return jsonify({"status": "error", "message": f"Chưa có hình ảnh từ {camera_id}"}), 400
        
    # Tạo thư mục lưu nếu chưa có
    save_dir = os.path.join('static', 'captures')
    os.makedirs(save_dir, exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Thực hiện phát hiện khuôn mặt bằng model ONNX để cắt ảnh
    face_boxes = detect_faces(clean_frame)
    
    if len(face_boxes) > 0:
        saved_files = []
        for idx, (x1, y1, x2, y2) in enumerate(face_boxes):
            # Cắt lấy riêng vùng khuôn mặt từ frame sạch
            face_img = clean_frame[y1:y2, x1:x2]
            
            filename = f"face_{camera_id}_{timestamp}_{idx + 1}.jpg"
            filepath = os.path.join(save_dir, filename)
            cv2.imwrite(filepath, face_img)
            saved_files.append(filename)
            
        msg = f"Đã phát hiện và chụp/lưu thành công {len(saved_files)} khuôn mặt!"
        return jsonify({
            "status": "success", 
            "message": msg,
            "filename": saved_files[0],
            "faces_count": len(saved_files)
        })
    else:
        # Fallback: Nếu không phát hiện thấy khuôn mặt nào, chụp lại toàn bộ camera để tránh lỗi luồng
        filename = f"full_{camera_id}_{timestamp}.jpg"
        filepath = os.path.join(save_dir, filename)
        cv2.imwrite(filepath, clean_frame)
        return jsonify({
            "status": "success", 
            "message": f"Không tìm thấy khuôn mặt, đã chụp toàn bộ khung hình: {filename}",
            "filename": filename,
            "faces_count": 0
        })

@app.route('/api/capture_preview/<camera_id>', methods=['POST'])
def capture_preview(camera_id):
    global clean_frames
    clean_frame = None
    with clean_frame_locks[camera_id]:
        if camera_id in clean_frames and clean_frames[camera_id] is not None:
            clean_frame = clean_frames[camera_id].copy()
            
    if clean_frame is None:
        return jsonify({"status": "error", "message": f"Chưa có hình ảnh từ {camera_id}"}), 400
        
    face_boxes = detect_faces(clean_frame)
    images_to_return = []
    
    if len(face_boxes) > 0:
        for idx, (x1, y1, x2, y2) in enumerate(face_boxes):
            face_img = clean_frame[y1:y2, x1:x2]
            ret, buffer = cv2.imencode('.jpg', face_img)
            if ret:
                base64_str = base64.b64encode(buffer.tobytes()).decode('utf-8')
                images_to_return.append({
                    "type": "face",
                    "data": f"data:image/jpeg;base64,{base64_str}",
                    "label": f"Khuôn mặt {idx + 1}"
                })
    else:
        # Fallback: Chụp toàn bộ khung hình
        ret, buffer = cv2.imencode('.jpg', clean_frame)
        if ret:
            base64_str = base64.b64encode(buffer.tobytes()).decode('utf-8')
            images_to_return.append({
                "type": "full",
                "data": f"data:image/jpeg;base64,{base64_str}",
                "label": "Khung hình đầy đủ (Không phát hiện khuôn mặt)"
            })
            
    if not images_to_return:
        return jsonify({"status": "error", "message": "Lỗi mã hóa hình ảnh preview"}), 500
        
    return jsonify({
        "status": "success",
        "images": images_to_return,
        "camera_id": camera_id
    })

@app.route('/api/save_captured_images', methods=['POST'])
def save_captured_images():
    try:
        data = request.get_json()
        if not data or 'images' not in data or 'camera_id' not in data:
            return jsonify({"status": "error", "message": "Dữ liệu không đầy đủ"}), 400
            
        camera_id = data['camera_id']
        images = data['images']
        
        save_dir = os.path.join('static', 'captures')
        os.makedirs(save_dir, exist_ok=True)
        
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        saved_count = 0
        
        for idx, img_obj in enumerate(images):
            img_data = img_obj.get('data', '')
            img_type = img_obj.get('type', 'face')
            
            if ',' in img_data:
                img_data = img_data.split(',')[1]
                
            decoded_img = base64.b64decode(img_data)
            
            # Khôi phục thành numpy array để lưu bằng OpenCV
            nparr = np.frombuffer(decoded_img, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is not None:
                prefix = "face" if img_type == "face" else "full"
                filename = f"{prefix}_{camera_id}_{timestamp}_{idx + 1}.jpg"
                filepath = os.path.join(save_dir, filename)
                cv2.imwrite(filepath, img)
                saved_count += 1
                
        if saved_count > 0:
            return jsonify({
                "status": "success",
                "message": f"Đã lưu thành công {saved_count} hình ảnh vào thư mục captures!"
            })
        else:
            return jsonify({"status": "error", "message": "Không thể lưu hình ảnh nào"}), 400
            
    except Exception as e:
        return jsonify({"status": "error", "message": f"Lỗi lưu ảnh: {str(e)}"}), 500

@app.route('/api/register_face', methods=['POST'])
def register_face():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "Không nhận được dữ liệu"}), 400
            
        username = data.get("username", "").strip()
        if not username:
            return jsonify({"status": "error", "message": "Vui lòng nhập tên người dùng"}), 400
            
        # Chuẩn hóa tên thư mục (chặn các ký tự đặc biệt)
        sanitized_username = re.sub(r'[\\/*?:"<>|]', "", username).replace(" ", "_")
        if not sanitized_username:
            sanitized_username = "user"
            
        # Tạo thư mục con riêng trong static/face_registrations
        save_dir = os.path.join('static', 'face_registrations', sanitized_username)
        os.makedirs(save_dir, exist_ok=True)
        
        # Lưu 3 kiểu ảnh
        poses = ['front', 'left', 'right']
        for pose in poses:
            img_data = data.get(pose)
            if not img_data:
                return jsonify({"status": "error", "message": f"Thiếu ảnh kiểu {pose}"}), 400
                
            if ',' in img_data:
                img_data = img_data.split(',')[1]
                
            decoded_img = base64.b64decode(img_data)
            
            # Lưu file ảnh
            filename = f"{pose}.jpg"
            filepath = os.path.join(save_dir, filename)
            with open(filepath, 'wb') as f:
                f.write(decoded_img)
                
        return jsonify({"status": "success", "message": f"Đăng ký khuôn mặt thành công cho {username}"})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Có lỗi xảy ra: {str(e)}"}), 500

if __name__ == '__main__':
    # Chạy Flask ở chế độ debug, lắng nghe trên 0.0.0.0 để các máy khác trong mạng LAN có thể xem
    app.run(host='0.0.0.0', port=5000, debug=True)
