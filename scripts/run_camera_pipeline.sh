#!/bin/bash
# ==============================================================================
# Fix & Run Camera Pipeline (services.face-ai)
# Thesis: Edge-based Open-Set Face Recognition on NVIDIA Jetson Orin Nano
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# 1. Chạy fix cấu hình và chuyển hướng cổng 5444 -> 5432
python3 "$PROJECT_ROOT/scripts/fix_face_ai_config.py"

# 2. Khởi chạy pipeline camera
echo ""
echo "===================================================================="
echo "  🚀 KHỞI CHẠY PIPELINE CAMERA AI (services.face-ai.app.main)"
echo "===================================================================="
python3 -m services.face-ai.app.main
