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

# 2. LuxTTS
printf "  ${BLUE}[2/5]${NC} LuxTTS TTS (8880)... "
LUXTTS_DIR="$DIR/LuxTTS"
if curl -s --max-time 1 http://localhost:8880/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ đang chạy (port 8880)${NC}"
elif [ -f "$LUXTTS_DIR/server.py" ]; then
  echo -e "${YELLOW}↻ khởi động...${NC}"
  # Cài dependencies nếu chưa có
  if ! $PYTHON -c "import zipvoice" 2>/dev/null; then
    echo -e "     ${YELLOW}→ Cài dependencies LuxTTS...${NC}"
    cd "$LUXTTS_DIR" && $PYTHON -m pip install -e . -q 2>/tmp/luxtts_install.log && cd "$DIR"
  fi
  cd "$LUXTTS_DIR"
  $PYTHON server.py > /tmp/luxtts.log 2>&1 &
  sleep 4
  cd "$DIR"
  curl -s --max-time 2 http://localhost:8880/health > /dev/null && echo -e "     ${GREEN}✓ LuxTTS OK${NC}" || echo -e "     ${YELLOW}– đang load model (xem /tmp/luxtts.log)${NC}"
else
  echo -e "${YELLOW}– không tìm thấy $LUXTTS_DIR${NC}"
fi

# 3. Whisper STT
printf "  ${BLUE}[3/5]${NC} Whisper STT (9000)... "
if curl -s --max-time 1 http://localhost:9000/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ đang chạy${NC}"
elif [ -f "$DIR/whisper_server.py" ]; then
  echo -e "${YELLOW}↻ khởi động...${NC}"
  WHISPER_MODEL=medium WHISPER_PORT=9000 nohup $PYTHON "$DIR/whisper_server.py" > /tmp/whisper.log 2>&1 &
  sleep 2
else
  echo -e "${YELLOW}– không tìm thấy whisper_server.py${NC}"
fi

# 4. AI Server
printf "  ${BLUE}[4/5]${NC} AI Server 192.168.1.9:8080... "
curl -s --max-time 2 http://192.168.1.9:8080/health > /dev/null 2>&1 \
  && echo -e "${GREEN}✓ online${NC}" || echo -e "${YELLOW}– offline${NC}"

# 5. Next.js
echo -e "  ${BLUE}[5/5]${NC} Khởi động NewHat App..."
lsof -ti:8006 | xargs kill -9 2>/dev/null || true; sleep 1

echo ""
  echo -e "  ${GREEN}┌─────────────────────────────────────────┐${NC}"
  echo -e "  ${GREEN}│  🚀  http://localhost:8006              │${NC}"
  echo -e "  ${GREEN}│  🔊  LuxTTS:  http://localhost:8880     │${NC}"
  echo -e "  ${GREEN}│  🎙️   Whisper: http://localhost:9000     │${NC}"
  echo -e "  ${GREEN}│  🗄️   PostgreSQL: newhat@localhost:5432  │${NC}"
  echo -e "  ${GREEN}└─────────────────────────────────────────┘${NC}"
echo ""

# Chạy app trong background
nohup npm run dev > /tmp/newhat_app.log 2>&1 &

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
