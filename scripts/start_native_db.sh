#!/bin/bash
# ==============================================================================
# Start Native PostgreSQL Cluster 14 on Port 5445
# Thesis: Edge-based Open-Set Face Recognition on NVIDIA Jetson Orin Nano
# ==============================================================================
set -e

echo "===================================================================="
echo "  🚀 KHỞI ĐỘNG CỤM NATIVE POSTGRESQL 14 TRÊN CỔNG PHỤ 5445"
echo "===================================================================="

# 1. Dọn dẹp file PID cũ nếu còn tồn đọng (nguyên nhân khiến status 'down')
DATA_DIR="/var/lib/postgresql/14/main"
if [ -f "$DATA_DIR/postmaster.pid" ]; then
    echo ">> Phát hiện file lock cũ: $DATA_DIR/postmaster.pid. Đang xóa để giải phóng cụm..."
    sudo rm -f "$DATA_DIR/postmaster.pid"
fi

# 2. Đảm bảo quyền thư mục socket /var/run/postgresql
sudo mkdir -p /var/run/postgresql
sudo chown -R postgres:postgres /var/run/postgresql
sudo chmod 2775 /var/run/postgresql

# 3. Đảm bảo cấu hình cổng 5445 và listen_addresses = '*' trong postgresql.conf
CONF_FILE="/etc/postgresql/14/main/postgresql.conf"
if [ -f "$CONF_FILE" ]; then
    echo ">> Cập nhật cấu hình cổng 5445 trong $CONF_FILE..."
    sudo sed -i "s/^port = .*/port = 5445/" "$CONF_FILE" || true
    sudo sed -i "s/^#port = 5432/port = 5445/" "$CONF_FILE" || true
    sudo sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" "$CONF_FILE" || true
    sudo sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" "$CONF_FILE" || true
fi

# 4. Khởi động lại cụm bằng pg_ctlcluster
echo ">> Đang khởi động cụm PostgreSQL 14 main..."
sudo pg_ctlcluster 14 main restart || sudo pg_ctlcluster 14 main start || true

sleep 2

# 5. Kiểm tra trạng thái bằng pg_lsclusters
echo ""
echo "📊 Trạng thái các cụm PostgreSQL hiện tại:"
pg_lsclusters

# 6. Thử kết nối kiểm tra
echo ""
if sudo -u postgres psql -p 5445 -c "SELECT 1;" >/dev/null 2>&1; then
    echo "===================================================================="
    echo "  🎉 CỤM NATIVE POSTGRESQL ĐÃ CHẠY THÀNH CÔNG TRÊN CỔNG 5445 (online)!"
    echo "===================================================================="
    echo ">> Danh sách các cơ sở dữ liệu (databases):"
    sudo -u postgres psql -p 5445 -c "\l"
else
    echo "⚠️ Vẫn chưa kết nối được qua cổng 5445. Kiểm tra log lỗi gần nhất:"
    sudo tail -n 25 /var/log/postgresql/postgresql-14-main.log || true
fi
