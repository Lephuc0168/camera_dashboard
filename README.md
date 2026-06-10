# Hướng dẫn chạy Hệ thống Giám sát Camera AI (Dashboard)

## 1. Yêu cầu hệ thống
- Máy tính đã cài đặt **Python** (phiên bản 3.7 trở lên).
- Có kết nối Camera (Webcam tích hợp trên Laptop hoặc Camera rời cắm qua cổng USB).

## 2. Cài đặt thư viện
Mở Terminal (hoặc Command Prompt / PowerShell) tại thư mục chứa dự án (`ai_camera_dashboard`) và chạy lệnh sau để cài đặt các thư viện cần thiết:

```bash
pip install flask opencv-python
```

## 3. Chạy ứng dụng
Sau khi cài đặt xong thư viện, bạn khởi động server bằng lệnh sau:

```bash
python app.py
```

Nếu chạy thành công, Terminal sẽ hiển thị các dòng thông báo tương tự như sau:
```text
 * Serving Flask app 'app'
 * Debug mode: on
 * Running on all addresses (0.0.0.0)
 * Running on http://127.0.0.1:5000
 * Running on http://192.168.1.x:5000
```

## 4. Truy cập Dashboard
- **Xem trên cùng máy tính đang chạy:** Mở trình duyệt web (Chrome, Edge, Safari,...) và truy cập vào địa chỉ: `http://localhost:5000`
- **Xem trên thiết bị khác (Điện thoại, máy tính khác cùng mạng Wifi):** Sử dụng địa chỉ IP LAN hiển thị trên Terminal (dòng cuối cùng, ví dụ: `http://192.168.1.5:5000`) và truy cập bằng trình duyệt của thiết bị đó.

## 5. Các lỗi thường gặp và cách xử lý
- **Lỗi không lên hình video (bị hiện ảnh Placeholder):** Đảm bảo máy tính của bạn có camera hoạt động. Đồng thời, kiểm tra xem có ứng dụng nào khác (Zoom, Zalo, Google Meet...) đang chiếm quyền sử dụng Camera không. Tắt các ứng dụng đó và tải lại trang.
- **Lỗi `ModuleNotFoundError: No module named 'flask'` (hoặc 'cv2'):** Bạn chưa cài đặt thư viện thành công ở bước 2. Hãy thử chạy lại lệnh `pip install flask opencv-python`.
- **Lỗi `Address already in use`:** Cổng 5000 đang bị phần mềm khác sử dụng. Bạn có thể mở file `app.py` và sửa port ở dòng cuối cùng `app.run(..., port=5001)` thành một cổng khác.
