#!/bin/bash
set -e
BLUE='\033[0;34m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
DIR="$(cd "$(dirname "$0")" && pwd)"
# Tìm python: ưu tiên conda nếu có
export PATH="/Users/nguyenhat/miniconda3/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -f "/Users/nguyenhat/miniconda3/bin/python3" ]; then
  PYTHON="/Users/nguyenhat/miniconda3/bin/python3"
else
  PYTHON="python3"
fi

# Kiểm tra và cài edge-tts nếu chưa có
if ! $PYTHON -c "import edge_tts" 2>/dev/null; then
  echo -e "  ${YELLOW}→ Cài edge-tts cho giọng Hoài My / Nam Minh...${NC}"
  $PYTHON -m pip install edge-tts -q 2>/dev/null || true
fi

# ============ CẤU HÌNH TỐI ƯU ============
export NODE_OPTIONS="--max-old-space-size=2048"
ulimit -v 8388608 2>/dev/null || true
export NEXT_TELEMETRY_DISABLED=1
export WHISPER_MODEL=medium
# ==========================================

echo -e "${BLUE}${BOLD}"
echo "  ███╗   ██╗███████╗██╗    ██╗██╗  ██╗ █████╗ ████████╗"
echo "  ████╗  ██║██╔════╝██║    ██║██║  ██║██╔══██╗╚══██╔══╝"
echo "  ██╔██╗ ██║█████╗  ██║ █╗ ██║███████║███████║   ██║   "
echo "  ██║╚██╗██║██╔══╝  ██║███╗██║██╔══██║██╔══██║   ██║   "
echo "  ██║ ╚████║███████╗╚███╔███╔╝██║  ██║██║  ██║   ██║   "
echo "  ╚═╝  ╚═══╝╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   "
echo -e "${NC}"
echo -e "  ${YELLOW}${BOLD}60 Ngày Thay Đổi Cuộc Đời${NC}"
echo "  ──────────────────────────────────────────────────"
echo ""

cd "$DIR"

# 1. PostgreSQL
printf "  ${BLUE}[1/5]${NC} PostgreSQL... "
if pg_isready -q 2>/dev/null; then
  echo -e "${GREEN}✓ đang chạy${NC}"
else
  brew services start postgresql@16 2>/dev/null || true; sleep 2
  pg_isready -q && echo -e "${GREEN}✓ đã khởi động${NC}" || echo -e "${RED}✗ lỗi${NC}"
fi

# 2. LuxTTS (Manual Start from Admin)
printf "  ${BLUE}[2/6]${NC} LuxTTS (8880) [Off]... "
if curl -s --max-time 1 http://localhost:8880/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ đang chạy (port 8880)${NC}"
else
  echo -e "${YELLOW}– Đang tắt (Bật thủ công từ trang Admin nếu cần)${NC}"
fi

# 3. Vietnamese TTS (Hybrid)
printf "  ${BLUE}[3/6]${NC} VN TTS (5001) [Edge+Piper]... "
if curl -s --max-time 1 http://localhost:5001/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ đang chạy (port 5001)${NC}"
elif [ -f "$DIR/piper_server.py" ]; then
  echo -e "${YELLOW}↻ khởi động...${NC}"
  if command -v conda &> /dev/null; then
    conda run -n hatai_env python "$DIR/piper_server.py" > /tmp/piper.log 2>&1 &
    sleep 3
    curl -s --max-time 2 http://localhost:5001/health > /dev/null && echo -e "     ${GREEN}✓ Piper OK (Tiếng Việt)${NC}" || echo -e "     ${YELLOW}– đang load model (xem /tmp/piper.log)${NC}"
  else
    echo -e "${YELLOW}– conda không tìm thấy${NC}"
  fi
else
  echo -e "${YELLOW}– không tìm thấy piper_server.py${NC}"
fi

# 4. Whisper STT (Hybrid)
printf "  ${BLUE}[4/6]${NC} Whisper Proxy (9000) [Hybrid]... "
if curl -s --max-time 1 http://localhost:9000/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ đang chạy${NC}"
elif [ -f "$DIR/whisper_server.py" ]; then
  echo -e "${YELLOW}↻ khởi động...${NC}"
  WHISPER_MODEL=$WHISPER_MODEL WHISPER_PORT=9000 nohup $PYTHON "$DIR/whisper_server.py" > /tmp/whisper.log 2>&1 &
  sleep 2
else
  echo -e "${YELLOW}– không tìm thấy whisper_server.py${NC}"
fi

# 5. AI Server
printf "  ${BLUE}[5/6]${NC} AI Server 192.168.1.9:8080... "
curl -s --max-time 2 http://192.168.1.9:8080/health > /dev/null 2>&1 \
  && echo -e "${GREEN}✓ online${NC}" || echo -e "${YELLOW}– offline${NC}"

# 6. Next.js
echo -e "  ${BLUE}[6/6]${NC} Khởi động NewHat App..."
lsof -ti:8006 | xargs kill -9 2>/dev/null || true; sleep 1

echo ""
  echo -e "  ${GREEN}┌─────────────────────────────────────────┐${NC}"
  echo -e "  ${GREEN}│  🚀  http://localhost:8006              │${NC}"
  echo -e "  ${GREEN}│  🔊  LuxTTS:  http://localhost:8880 (Lazy)│${NC}"
  echo -e "  ${GREEN}│  🎙️   VN TTS:  http://localhost:5001 (Hybr)│${NC}"
  echo -e "  ${GREEN}│  🎤  Whisper: http://localhost:9000 (Hybr)│${NC}"
  echo -e "  ${GREEN}│  🗄️   PostgreSQL: newhat@localhost:5432  │${NC}"
  echo -e "  ${GREEN}└─────────────────────────────────────────┘${NC}"
echo ""

# Chạy app trong background (Standalone mode siêu nhẹ)
export PORT=8006
export HOSTNAME="0.0.0.0"

# Nạp biến môi trường từ .env và .env.local
if [ -f "$DIR/.env" ]; then
  set -a; source "$DIR/.env"; set +a
fi
if [ -f "$DIR/.env.local" ]; then
  set -a; source "$DIR/.env.local"; set +a
fi

# Đảm bảo các file cần thiết có trong standalone folder
mkdir -p "$DIR/.next/standalone/.next/static"
cp -r "$DIR/public" "$DIR/.next/standalone/" 2>/dev/null || true
cp -r "$DIR/.next/static" "$DIR/.next/standalone/.next/" 2>/dev/null || true
cp -r "$DIR/prisma" "$DIR/.next/standalone/" 2>/dev/null || true

nohup node "$DIR/.next/standalone/server.js" > /tmp/newhat_app.log 2>&1 &

echo -n "  Đang kiểm tra kết nối... "
for i in {1..30}; do
  if curl -s http://localhost:8006 > /dev/null; then
    echo -e "${GREEN}✓ OK${NC}"
    echo ""
    echo -e "  ${YELLOW}Đã khởi động thành công!${NC}"
    echo -e "  ${YELLOW}Cửa sổ Terminal này sẽ tự động đóng sau 3 giây...${NC}"
    sleep 3
    # Lệnh AppleScript để tắt Terminal window
    osascript -e 'tell application "Terminal" to close (every window whose name contains "start.sh")' &
    exit 0
  fi
  echo -n "."
  sleep 1
done

echo -e "\n  ${RED}✗ App chưa sẵn sàng sau 30 giây.${NC}"
echo -e "  Vui lòng kiểm tra log: ${BOLD}tail -f /tmp/newhat_app.log${NC}"
