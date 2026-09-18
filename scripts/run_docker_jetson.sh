#!/bin/bash
# ==============================================================================
# One-Click Docker Deploy & Runner on NVIDIA Jetson Orin Nano
# Thesis: Edge-based Open-Set Face Recognition (Spec v3 §18)
# ==============================================================================
set -e

echo "===================================================================="
echo "  🚀 KHỞI CHẠY HỆ THỐNG OPEN-SET FACE RECOGNITION BẰNG DOCKER"
echo "===================================================================="

# 1. Xác định thư mục dự án
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "[1/4] Thư mục dự án: $PROJECT_ROOT"

# 2. Kiểm tra Docker & nạp kernel module cho Jetson
echo "[2/4] Kiểm tra Docker Engine & nạp module mạng (veth/bridge)..."
sudo modprobe veth 2>/dev/null || true
sudo modprobe bridge 2>/dev/null || true
if ! grep -q "^veth" /etc/modules 2>/dev/null; then
    echo "veth" | sudo tee -a /etc/modules >/dev/null 2>&1 || true
fi

if ! command -v docker &> /dev/null; then
    echo "  ❌ Docker chưa được cài đặt. Tiến hành cài đặt Docker..."
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose-plugin
    sudo usermod -aG docker $USER
    echo "  ⚠️ Vui lòng đăng xuất và đăng nhập lại để quyền docker có hiệu lực!"
fi

COMPOSE_CMD="docker compose"
if ! docker compose version &> /dev/null; then
    if command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        echo "  ❌ Docker Compose chưa được cài đặt. Đang cài đặt..."
        sudo apt-get install -y docker-compose-plugin || sudo apt-get install -y docker-compose
        COMPOSE_CMD="docker compose"
    fi
fi

echo "  ✅ Sử dụng lệnh: $COMPOSE_CMD"

# 3. Build và khởi động các container
echo "[3/4] Đang build và khởi động các container (Postgres, Backend, Frontend, MediaMTX)..."
# Tránh lỗi veth sandbox của BuildKit trên Jetson bằng --network host
export DOCKER_BUILDKIT=0
$COMPOSE_CMD build --network host || $COMPOSE_CMD build
$COMPOSE_CMD up -d

# 4. Kiểm tra trạng thái
echo "[4/4] Trạng thái các dịch vụ đang chạy:"
$COMPOSE_CMD ps

# Lấy địa chỉ IP mạng nội bộ của Jetson
IP_ADDR=$(hostname -I | awk '{print $1}' || echo "localhost")

echo "===================================================================="
echo "🎉 HỆ THỐNG ĐÃ SẴN SÀNG HOẠT ĐỘNG!"
echo "===================================================================="
echo "  🖥️  Web Dashboard:     http://${IP_ADDR}:3000   (hoặc http://localhost:3000)"
echo "  ⚙️  FastAPI Swagger:    http://${IP_ADDR}:8000/docs"
echo "  📹  MediaMTX (WebRTC):  http://${IP_ADDR}:8889"
echo "  🗄️  PostgreSQL DB:      localhost:5432 (Database: open_set_fr)"
echo "===================================================================="
echo "Lệnh hữu ích:"
echo "  • Xem log realtime:   $COMPOSE_CMD logs -f"
echo "  • Tắt hệ thống:       $COMPOSE_CMD down"
echo "  • Khởi động lại:      $COMPOSE_CMD restart"
echo "===================================================================="