#!/bin/bash
# ==============================================================================
# One-Click Admin Account Generator / Password Reset
# Open-Set Face Recognition Thesis Project
# ==============================================================================
set -e

echo "=== [1/2] Creating/Resetting Admin Account in Database ==="

if docker ps --format '{{.Names}}' | grep -q "open_set_fr_backend"; then
    echo ">> Generating valid bcrypt hash directly via open_set_fr_backend Python container..."
    docker exec -i open_set_fr_backend python3 -c "
from app.db.database import SessionLocal
from app.db.models import User
from app.auth.password import get_password_hash

db = SessionLocal()
u = db.query(User).filter(User.username == 'admin').first()
if not u:
    u = User(username='admin', role='admin', is_active=True)
u.password_hash = get_password_hash('admin')
u.role = 'admin'
u.is_active = True
db.add(u)
db.commit()
print('Successfully generated hash and updated admin account in DB!')
db.close()
"
else
    echo ">> Inserting admin user directly via open_set_fr_postgres..."
    docker exec -i open_set_fr_postgres psql -U open_set_fr -d open_set_fr <<'EOF'
INSERT INTO users (username, password_hash, role, is_active)
VALUES ('admin', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'admin', true)
ON CONFLICT (username) 
DO UPDATE SET 
    password_hash = '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
    role = 'admin',
    is_active = true;
EOF
fi

echo ""
echo "=== [2/2] Verifying User in Database ==="
docker exec -i open_set_fr_postgres psql -U open_set_fr -d open_set_fr -c "SELECT user_id, username, role, is_active FROM users WHERE username = 'admin';"

echo ""
echo "===================================================================="
echo "✅ TÀI KHOẢN ADMIN ĐÃ SẴN SÀNG TRONG DATABASE!"
echo "===================================================================="
echo "  👉 Username:  admin"
echo "  👉 Password:  admin"
echo "===================================================================="
echo "Hãy quay lại màn hình trình duyệt và đăng nhập ngay!"
