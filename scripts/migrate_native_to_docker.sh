#!/bin/bash
# ==============================================================================
# Migrate all legacy data from Native PostgreSQL to Docker PostgreSQL Container
# Open-Set Face Recognition Thesis Project
# ==============================================================================
set -e

echo "===================================================================="
echo "  📦 CHUYỂN DỮ LIỆU TỪ NATIVE POSTGRESQL SANG DOCKER CONTAINER"
echo "===================================================================="

# Đổi thư mục sang /tmp để tránh lỗi 'Permission denied' của user postgres
cd /tmp

# 1. Tạm dừng container Docker postgres để nhường cổng 5432 cho Native Postgres
echo "[1/5] Tạm dừng container open_set_fr_postgres..."
docker stop open_set_fr_postgres 2>/dev/null || true

# 2. Khởi động Native Postgres và đợi đến khi sẵn sàng
echo "[2/5] Khởi động Native PostgreSQL..."
if command -v pg_lsclusters &>/dev/null; then
    pg_lsclusters -h | while read -r ver name port status rest; do
        if [ "$status" != "online" ]; then
            echo "  >> Đang bật cluster PostgreSQL $ver/$name..."
            sudo pg_ctlcluster "$ver" "$name" start 2>/dev/null || true
        fi
    done
fi
sudo systemctl start postgresql 2>/dev/null || true

# Đợi socket sẵn sàng (tối đa 10s)
READY=0
for i in {1..10}; do
    if sudo -u postgres psql -c "SELECT 1;" >/dev/null 2>&1; then
        READY=1
        echo "  ✅ Native PostgreSQL đã khởi động thành công!"
        break
    fi
    sleep 1
done

if [ $READY -ne 1 ]; then
    echo "  ⚠️ Không thể kết nối tới Native PostgreSQL trên máy chủ Jetson."
    echo "  >> Kiểm tra trạng thái: sudo systemctl status postgresql"
    echo "  >> Khởi động lại Docker Postgres để tiếp tục sử dụng bình thường..."
    docker start open_set_fr_postgres 2>/dev/null || true
    exit 1
fi

# Kiểm tra xem database open_set_fr có tồn tại trên Native Postgres không
if ! sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "open_set_fr"; then
    echo "  ⚠️ Không tìm thấy cơ sở dữ liệu 'open_set_fr' trong Native PostgreSQL."
    echo "  >> Đang bật lại container Docker..."
    sudo systemctl stop postgresql 2>/dev/null || true
    docker start open_set_fr_postgres 2>/dev/null || true
    echo "  Database trong Docker hiện đã sẵn sàng."
    exit 0
fi

# Kiểm tra số lượng người trong database Native
COUNT_PERSONS=$(sudo -u postgres psql -d open_set_fr -tAc "SELECT count(*) FROM persons;" 2>/dev/null || echo "0")
echo "  📊 Tìm thấy $COUNT_PERSONS người trong database Native cũ."

DUMP_FILE="/tmp/legacy_open_set_fr_data.sql"
rm -f "$DUMP_FILE"

# Dump dữ liệu các bảng
sudo -u postgres pg_dump -d open_set_fr --data-only \
    -t persons \
    -t face_embeddings \
    -t cameras \
    -t recognition_events \
    -t identity_thresholds \
    --inserts \
    --on-conflict-do-nothing \
    -f "$DUMP_FILE" 2>/dev/null || \
sudo -u postgres pg_dump -d open_set_fr --data-only \
    -t persons \
    -t face_embeddings \
    -t cameras \
    -t recognition_events \
    -t identity_thresholds \
    -f "$DUMP_FILE"

echo "  ✅ Đã xuất dữ liệu ra file tạm: $DUMP_FILE"

# 3. Tắt Native Postgres để trả lại cổng 5432
echo "[3/5] Tắt Native PostgreSQL..."
sudo systemctl stop postgresql 2>/dev/null || true
if command -v pg_lsclusters &>/dev/null; then
    pg_lsclusters -h | while read -r ver name port status rest; do
        sudo pg_ctlcluster "$ver" "$name" stop 2>/dev/null || true
    done
fi

# 4. Bật lại Docker Postgres container
echo "[4/5] Bật lại Docker open_set_fr_postgres container..."
docker start open_set_fr_postgres
sleep 3

# 5. Nạp dữ liệu vào Docker Postgres
echo "[5/5] Nạp dữ liệu vào Docker Postgres container..."
if [ -f "$DUMP_FILE" ] && [ -s "$DUMP_FILE" ]; then
    docker exec -i open_set_fr_postgres psql -U open_set_fr -d open_set_fr < "$DUMP_FILE" || true
fi

# Khởi động lại backend để nạp lại ma trận nhận diện khuôn mặt
echo ">> Khởi động lại backend để nạp ma trận nhận diện..."
docker compose restart backend

echo ""
echo "===================================================================="
echo "🎉 HOÀN TẤT CHUYỂN DỮ LIỆU SANG DOCKER!"
echo "===================================================================="
docker exec -i open_set_fr_postgres psql -U open_set_fr -d open_set_fr -c "
SELECT 
    (SELECT count(*) FROM persons) as total_persons,
    (SELECT count(*) FROM face_embeddings) as total_embeddings,
    (SELECT count(*) FROM cameras) as total_cameras,
    (SELECT count(*) FROM identity_thresholds) as total_thresholds;
"
echo "===================================================================="
echo "Hãy quay lại trình duyệt và nhấn nút 'Reload Gallery' (hoặc F5)!"
echo "===================================================================="
