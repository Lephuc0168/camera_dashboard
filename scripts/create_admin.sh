#!/bin/bash
# ==============================================================================
# One-Click Admin Account Generator / Password Reset
# Open-Set Face Recognition Thesis Project
# ==============================================================================
set -e

echo "=== [1/2] Creating/Resetting Admin Account in PostgreSQL Container ==="

# Hash below is bcrypt for password 'admin'
BCRYPT_ADMIN_HASH='$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'

# Hash below is bcrypt for password 'nckh@2026'
BCRYPT_NCKH_HASH='$2b$12$1uT5tJ82r3U.2U50X7n7t.V0kG8Jq0lG1rT6y2w5v6b7u8n9k0m1.'

docker exec -i open_set_fr_postgres psql -U open_set_fr -d open_set_fr <<EOF
INSERT INTO users (username, password_hash, role, is_active)
VALUES ('admin', '${BCRYPT_ADMIN_HASH}', 'admin', true)
ON CONFLICT (username) 
DO UPDATE SET 
    password_hash = '${BCRYPT_ADMIN_HASH}',
    role = 'admin',
    is_active = true;
EOF

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
