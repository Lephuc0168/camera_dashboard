#!/bin/bash
# ==============================================================================
# Migrate all legacy data from Native PostgreSQL to Docker PostgreSQL Container
# Open-Set Face Recognition Thesis Project
# ==============================================================================
set -e

echo "===================================================================="
echo "  📦 CHUYỂN DỮ LIỆU TỪ NATIVE POSTGRESQL SANG DOCKER CONTAINER"
echo "===================================================================="

# 1. Tạm dừng container Docker postgres để nhường cổng 5432 cho Native Postgres
echo "[1/5] Tạm dừng container open_set_fr_postgres..."
docker stop open_set_fr_postgres 2>/dev/null || true

# 2. Khởi động Native Postgres và dump dữ liệu
echo "[2/5] Khởi động Native PostgreSQL và xuất dữ liệu..."
sudo systemctl start postgresql

DUMP_FILE="/tmp/legacy_open_set_fr_data.sql"
rm -f "$DUMP_FILE"

# Dump dữ liệu các bảng: persons, face_embeddings, cameras, recognition_events, identity_thresholds
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
sudo systemctl stop postgresql

# 4. Bật lại Docker Postgres container
echo "[4/5] Bật lại Docker open_set_fr_postgres container..."
docker start open_set_fr_postgres
sleep 3

# 5. Nạp dữ liệu vào Docker Postgres
echo "[5/5] Nạp dữ liệu vào Docker Postgres container..."
docker exec -i open_set_fr_postgres psql -U open_set_fr -d open_set_fr < "$DUMP_FILE"

# Khởi động lại backend để nạp lại ma trận nhận diện khuôn mặt (Gallery Matrix)
echo ">> Khởi động lại backend để nạp ma trận nhận diện..."
docker compose restart backend

echo ""
echo "===================================================================="
echo "🎉 HOÀN TẤT CHUYỂN TOÀN BỘ DỮ LIỆU SANG DOCKER!"
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
