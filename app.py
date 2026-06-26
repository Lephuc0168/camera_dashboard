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

app = Flask(__name__)

# ==========================================
# CẤU HÌNH CÁC NGUỒN VIDEO (HỖ TRỢ 4 CAMERA)
# ==========================================
VIDEO_SOURCES = {
    "camera_1": "tcp://192.168.31.102:5005",
    "camera_2": "tcp://192.168.31.102:5006",
    "camera_3": "tcp://192.168.31.102:5007",
    "camera_4": "tcp://192.168.31.102:5008"
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

def generate_frames(camera_id):
    global latest_frames
    
    if camera_id not in VIDEO_SOURCES:
        return
        
    source = VIDEO_SOURCES[camera_id]
    cap = None
    
    # Biến đo FPS thực tế
    fps_start_time = time.time()
    fps_counter = 0
    
    while True:
        # Nếu chưa khởi tạo hoặc kết nối bị đóng, tạo mới VideoCapture
        if cap is None or not cap.isOpened():
            with stats_lock:
                camera_stats[camera_id]["status"] = "Connecting"
                camera_stats[camera_id]["fps"] = 0
                
            if cap is not None:
                cap.release()
            print(f"[*] Connecting to {camera_id}: {source}...")
            cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
            
            if not cap.isOpened():
                print(f"[-] Failed to connect to {camera_id}. Retrying in 2s...")
                with stats_lock:
                    camera_stats[camera_id]["status"] = "Offline"
                time.sleep(2)
                continue
            print(f"[+] Successfully connected to {camera_id}!")
            
        success, frame = cap.read()
        if not success:
            print(f"[-] Disconnected or waiting for stream from {camera_id}. Reconnecting...")
            with stats_lock:
                camera_stats[camera_id]["status"] = "Offline"
                camera_stats[camera_id]["fps"] = 0
            cap.release()
            cap = None
            time.sleep(1)
            continue
            
        # Tính toán FPS thực tế
        fps_counter += 1
        elapsed = time.time() - fps_start_time
        if elapsed >= 1.0:
            current_fps = int(fps_counter / elapsed)
            h, w = frame.shape[:2]
            with stats_lock:
                camera_stats[camera_id]["fps"] = current_fps
                camera_stats[camera_id]["resolution"] = f"{w}x{h}"
                camera_stats[camera_id]["status"] = "Online"
            fps_counter = 0
            fps_start_time = time.time()
            
        # Lưu lại frame mới nhất để chụp ảnh
        latest_frames[camera_id] = frame.copy()
        
        # Mã hóa frame sang định dạng JPEG
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            continue
        frame_bytes = buffer.tobytes()
        
        # Trả về luồng byte MJPEG cho trình duyệt
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
               
    if cap is not None:
        cap.release()

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
    global latest_frames
    if camera_id not in latest_frames or latest_frames[camera_id] is None:
        return jsonify({"status": "error", "message": f"Chưa có hình ảnh từ {camera_id}"}), 400
        
    # Tạo thư mục lưu nếu chưa có
    save_dir = os.path.join('static', 'captures')
    os.makedirs(save_dir, exist_ok=True)
    
    # Tạo tên file theo thời gian và camera id
    filename = f"{camera_id}_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    filepath = os.path.join(save_dir, filename)
    
    cv2.imwrite(filepath, latest_frames[camera_id])
    return jsonify({"status": "success", "message": f"Đã chụp và lưu thành công {filename}"})

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
