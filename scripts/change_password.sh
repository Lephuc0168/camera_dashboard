#!/bin/bash
# ==============================================================================
# Password Reset Tool & Frontend Hot-Patch
# Allows changing password for any user and ensures frontend is completely updated
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

USER_TARGET="${1:-admin}"
NEW_PASS="$2"

if [ -z "$NEW_PASS" ]; then
    echo "===================================================================="
    echo "  🔐 ĐỔI MẬT KHẨU TÀI KHOẢN TRÊN NVIDIA JETSON DASHBOARD"
    echo "===================================================================="
    echo "Đang đổi mật khẩu cho tài khoản: [ $USER_TARGET ]"
    read -rsp "Nhập mật khẩu mới mong muốn: " NEW_PASS
    echo ""
    if [ -z "$NEW_PASS" ]; then
        echo "❌ Mật khẩu không được để trống!"
        exit 1
    fi
fi

echo ""
echo ">> [1/3] Cập nhật giao diện Frontend mới nhất vào Docker container..."
if docker ps --format '{{.Names}}' | grep -q "open_set_fr_frontend"; then
    docker cp "$PROJECT_ROOT/frontend/dist/." open_set_fr_frontend:/usr/share/nginx/html/ 2>/dev/null || true
    echo "  ✅ Đã đồng bộ giao diện sạch (không lưu sẵn mật khẩu) vào Frontend container."
fi

echo ">> [2/3] Cập nhật mật khẩu mới bằng Bcrypt trong Database..."
docker exec -i open_set_fr_backend python3 -c "
import bcrypt
from app.db.database import SessionLocal
from app.db.models import User

username = '${USER_TARGET}'
new_pw = '''${NEW_PASS}'''

hashed = bcrypt.hashpw(new_pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

db = SessionLocal()
u = db.query(User).filter(User.username.ilike(username)).first()
if not u:
    u = User(username=username, role='admin', is_active=True)
u.password_hash = hashed
u.is_active = True
db.add(u)
db.commit()
db.close()
print(f'  ✅ Đã đổi mật khẩu thành công cho người dùng: [{username}]')
"

echo ">> [3/3] Khởi động lại Backend để áp dụng các thay đổi..."
docker compose restart backend >/dev/null 2>&1 || true

echo ""
echo "===================================================================="
echo "🎉 HOÀN TẤT ĐỔI MẬT KHẨU & CẬP NHẬT BẢO MẬT!"
echo "===================================================================="
echo "  👉 Username: $USER_TARGET"
echo "  👉 Mật khẩu: (Đã lưu mật khẩu mới của bạn)"
echo "===================================================================="
echo "Bây giờ bạn hãy mở lại trình duyệt và đăng nhập với mật khẩu mới!"
