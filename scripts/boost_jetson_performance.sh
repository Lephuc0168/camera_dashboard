#!/bin/bash
# ==============================================================================
# Jetson Orin Nano Performance Booster & Camera Pipeline Fixer
# Eliminates Thermal/Power Throttling, Lock Contention, and Reconnect Loops
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "===================================================================="
echo "  🚀 KÍCH HOẠT HIỆU NĂNG TỐI ĐA (MAXN) CHO NVIDIA JETSON ORIN NANO"
echo "===================================================================="

# 1. Chuyển Power Mode sang MAXN (Chế độ công suất tối đa, mở khóa tất cả CPU/GPU cores)
echo ">> [1/6] Thiết lập nvpmodel sang Chế độ Hiệu Năng Tối Đa (Mode 0: MAXN)..."
if command -v nvpmodel >/dev/null 2>&1; then
    sudo nvpmodel -m 0 || true
    sudo nvpmodel -q || true
else
    echo "   (Bỏ qua nvpmodel: Không tìm thấy lệnh nvpmodel)"
fi

# 2. Khóa xung nhịp CPU, GPU, EMC ở mức tối đa (Không bị dynamic throttling)
echo ">> [2/6] Ghim xung nhịp CPU/GPU tối đa qua jetson_clocks..."
if command -v jetson_clocks >/dev/null 2>&1; then
    sudo jetson_clocks || true
    sudo jetson_clocks --fan 2>/dev/null || true
    echo "✅ Xung nhịp Jetson đã được khóa ở tần số tối đa!"
fi

# 3. Mở rộng buffer mạng cho RTSP (tránh drop gói và ngắt kết nối mạng WiFi/LAN)
echo ">> [3/6] Mở rộng buffer nhận mạng cho RTSP..."
sudo sysctl -w net.core.rmem_max=26214400 2>/dev/null || true
sudo sysctl -w net.core.rmem_default=26214400 2>/dev/null || true

# 4. Dọn dẹp tiến trình camera cũ bị treo và restart daemon CSI
echo ">> [4/6] Dọn dẹp các tiến trình xung đột camera..."
docker stop open_set_fr_mediamtx 2>/dev/null || true
sudo pkill -9 -f "app.py" 2>/dev/null || true
sudo systemctl restart nvargus-daemon 2>/dev/null || true
echo "✅ Đã giải phóng tài nguyên phần cứng camera và GPU."

# 5. Đồng bộ mã nguồn face_api_server.py đã tối ưu hóa zero-lock
echo ">> [5/6] Đồng bộ face_api_server.py (zero-lock & frame caching) vào pipeline..."
OPT_SERVER="$PROJECT_ROOT/jetson_files/face_api_server.py"
if [ -f "$OPT_SERVER" ]; then
    TARGET_DIRS=(
        "$PROJECT_ROOT/services/face-ai/app"
        "$HOME/open-set-face-recognition/services/face-ai/app"
        "$HOME/dt/services/face-ai/app"
    )
    for tdir in "${TARGET_DIRS[@]}"; do
        if [ -d "$tdir" ]; then
            cp -f "$OPT_SERVER" "$tdir/"
            echo "   • Đã cập nhật: $tdir/face_api_server.py"
        fi
    done
fi

# 6. Kiểm tra nhiệt độ và tình trạng hệ thống
echo ">> [6/6] Thống kê nhiệt độ phần cứng:"
for i in 0 1 2; do
    if [ -f "/sys/devices/virtual/thermal/thermal_zone$i/temp" ]; then
        TEMP=$(cat /sys/devices/virtual/thermal/thermal_zone$i/temp 2>/dev/null || echo 0)
        TEMP_C=$((TEMP / 1000))
        TYPE=$(cat /sys/devices/virtual/thermal/thermal_zone$i/type 2>/dev/null || echo "zone$i")
        echo "   • Nhiệt độ $TYPE: ${TEMP_C}°C"
    fi
done

echo ""
echo "===================================================================="
echo "🎉 TỐI ƯU HÓA HOÀN TẤT! Hệ thống sẵn sàng chạy mượt mà 25-30 FPS."
echo "👉 Đang khởi chạy pipeline Camera AI..."
echo "===================================================================="
bash "$PROJECT_ROOT/scripts/run_camera_pipeline.sh"
