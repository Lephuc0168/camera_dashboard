#!/bin/bash
# ==============================================================================
# One-Click Database Reconciliation: Native PostgreSQL vs Docker PostgreSQL
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "===================================================================="
echo "  🔍 CÔNG CỤ ĐỐI CHIẾU DATABASE GỐC (NATIVE) VÀ DATABASE MỚI (DOCKER)"
echo "===================================================================="

# 1. Đảm bảo Docker DB đang chạy
if ! docker ps --format '{{.Names}}' | grep -q "open_set_fr_postgres"; then
    echo ">> Đang khởi động Docker PostgreSQL container..."
    docker compose up -d postgres
    sleep 2
fi

# 2. Kiểm tra xem Native Postgres có đang chạy ở port 5445/5444 không
RUNNING_OLD=0
for P in 5445 5444 5433; do
    if sudo -u postgres psql -p "$P" -c "SELECT 1;" >/dev/null 2>&1; then
        RUNNING_OLD=1
        break
    fi
done

# Nếu chưa chạy, bật cluster native main trên port 5445
if [ "$RUNNING_OLD" -eq 0 ]; then
    echo ">> Cụm Native PostgreSQL đang dừng. Đang dọn dẹp PID cũ và khởi động trên cổng 5445..."
    for pid_file in /var/lib/postgresql/*/main/postmaster.pid; do
        if [ -f "$pid_file" ]; then
            sudo rm -f "$pid_file"
        fi
    done
    sudo mkdir -p /var/run/postgresql
    sudo chown -R postgres:postgres /var/run/postgresql
    sudo chmod 2775 /var/run/postgresql

    for conf_file in /etc/postgresql/*/main/postgresql.conf; do
        if [ -f "$conf_file" ]; then
            PG_VER=$(echo "$conf_file" | cut -d/ -f4)
            sudo sed -i "s/^port = .*/port = 5445/" "$conf_file" || true
            sudo sed -i "s/^#port = 5432/port = 5445/" "$conf_file" || true
            sudo sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" "$conf_file" || true
            sudo sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" "$conf_file" || true
            sudo pg_ctlcluster "$PG_VER" main restart || sudo pg_ctlcluster "$PG_VER" main start || true
        fi
    done
    sleep 2
fi

# 3. Cài đặt psycopg2 nếu thiếu
if ! python3 -c "import psycopg2" 2>/dev/null; then
    pip3 install psycopg2-binary --quiet 2>/dev/null || true
fi

# 4. Chạy script đối chiếu
python3 "$PROJECT_ROOT/scripts/compare_dbs.py" "$@"
