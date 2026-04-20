#!/bin/bash
# ============================================================
#  NewHat — LaunchDaemon Startup Script
#  Chạy bởi launchd lúc boot (không cần user login)
# ============================================================

# ── Môi trường tuyệt đối (launchd không có user env) ──────
export HOME="/Users/nguyenhat"
export USER="nguyenhat"
export LOGNAME="nguyenhat"
export PATH="/usr/local/bin:/Users/nguyenhat/miniconda3/bin:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin"
export LANG="en_US.UTF-8"

PYTHON="/Users/nguyenhat/miniconda3/bin/python3"
NPM="/usr/local/bin/npm"
NODE="/usr/local/bin/node"
DIR="/Users/nguyenhat/Documents/NewHat"
LOG="/tmp"
PG_BIN="/opt/homebrew/opt/postgresql@16/bin"
PG_DATA="/opt/homebrew/var/postgresql@16"

# stdout/stderr đã được plist redirect vào log file — không cần tee

echo ""
echo "============================================================"
echo "  NewHat Boot — $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================================"

cd "$DIR"

# ── 1. PostgreSQL ─────────────────────────────────────────
echo "[1/4] PostgreSQL..."
if "$PG_BIN/pg_isready" -q 2>/dev/null; then
  echo "  ✓ PostgreSQL đang chạy"
else
  "$PG_BIN/pg_ctl" start \
    -D "$PG_DATA" \
    -l "$LOG/postgres.log" \
    -o "--unix_socket_directories=/tmp" \
    -w 2>/dev/null
  sleep 2
  "$PG_BIN/pg_isready" -q && echo "  ✓ PostgreSQL OK" || echo "  ✗ PostgreSQL lỗi — xem $LOG/postgres.log"
fi

# ── 2. LuxTTS (port 8880) ────────────────────────────────
echo "[2/4] LuxTTS (port 8880)..."
if curl -s --max-time 2 http://localhost:8880/health > /dev/null 2>&1; then
  echo "  ✓ LuxTTS đang chạy"
elif [ -f "$DIR/LuxTTS/server.py" ]; then
  cd "$DIR/LuxTTS"
  nohup "$PYTHON" server.py > "$LOG/newhat_luxtts.log" 2>&1 &
  echo "  ↻ LuxTTS đã khởi động (PID $!) — xem $LOG/newhat_luxtts.log"
  cd "$DIR"
else
  echo "  – Không tìm thấy LuxTTS/server.py"
fi

# ── 3. Whisper STT (port 9000) ───────────────────────────
echo "[3/4] Whisper STT (port 9000)..."
if curl -s --max-time 2 http://localhost:9000/health > /dev/null 2>&1; then
  echo "  ✓ Whisper đang chạy"
elif [ -f "$DIR/whisper_server.py" ]; then
  WHISPER_MODEL=medium WHISPER_PORT=9000 \
    nohup "$PYTHON" "$DIR/whisper_server.py" > "$LOG/newhat_whisper.log" 2>&1 &
  echo "  ↻ Whisper đã khởi động (PID $!) — xem $LOG/newhat_whisper.log"
else
  echo "  – Không tìm thấy whisper_server.py"
fi

# ── 4. Next.js (port 8006) ───────────────────────────────
echo "[4/4] Next.js (port 8006)..."
# Kill process cũ trên port 8006 nếu còn
lsof -ti:8006 | xargs kill -9 2>/dev/null || true
sleep 1

echo "  🚀 Khởi động NewHat App..."
echo ""

# Chạy foreground — launchd monitor process này
# Nếu crash → launchd tự restart (KeepAlive = true)
exec "$NPM" run dev 2>&1
