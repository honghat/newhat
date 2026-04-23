# NewHat — 60 Ngày Thay Đổi

Ứng dụng học Full-Stack & Tiếng Anh trong 60 ngày với AI hỗ trợ, tối ưu hóa cho Mac Mini M4.

## 🎯 Tính năng chính

### 📚 Bài Học Lập Trình (Learn)
- **AI tạo bài học**: Tự động tạo bài học mới, không lặp lại
- **25+ ngôn ngữ & framework**: JavaScript, Python, React, Next.js, Go, Rust, Power BI, Excel VBA, v.v.
- **Quiz tương tác**: Kiểm tra kiến thức sau mỗi bài
- **Lịch sử học tập**: Theo dõi tiến độ học

### 💬 Hỏi Code (Code Assistant)
- **Giải thích code**: Paste code, AI giải thích chi tiết + ví dụ tương tự
- **Tạo code mẫu**: Mô tả yêu cầu, AI tạo code hoàn chỉnh
- **Lưu lịch sử**: Tất cả giải thích/code mẫu được lưu vào PostgreSQL

### 🇬🇧 Tiếng Anh & Tiếng Việt (Language)
- **Luyện nói (Speaking)**: Ghi âm & nhận diện giọng nói (Whisper Hybrid: Ưu tiên Groq Cloud, dự phòng Local Whisper.cpp).
- **TTS đa ngôn ngữ (Lazy Load)**:
  - Tiếng Anh: **LuxTTS** (Lazy Load — chỉ chạy khi cần).
  - Tiếng Việt: **Edge TTS** (Mặc định - Siêu nhẹ) hoặc **Piper TTS** (Dự phòng Local - Lazy Load).

## 🚀 Cổng Dịch Vụ

| Cổng | Dịch vụ | Mô tả |
|------|---------|-------|
| **8006** | Next.js App | Web chính (Standalone Mode) |
| **8880** | LuxTTS | TTS Tiếng Anh (**Lazy Load**) |
| **5001** | TTS Tiếng Việt | Hybrid: **Edge-TTS** + Piper Fallback |
| **9000** | Whisper Proxy | STT (**Hybrid**: Groq / Local Whisper.cpp) |
| **5432** | PostgreSQL | Database |
| **8080** | AI Server | LLM (Remote) |

## ⚡ Khởi động (Dành cho Mac Mini M4)

Project hiện tại được đặt tại: `/Users/nguyenhat/NewHat`

### 1. Khởi động thủ công
Dùng cho phát triển hoặc kiểm tra:
```bash
cd /Users/nguyenhat/NewHat
./start.sh
```

### 2. Tự động khởi động cùng hệ thống (LaunchAgent)
Dùng để chạy 24/7 như một server:
```bash
# Đăng ký Agent (Chỉ làm 1 lần)
cp /Users/nguyenhat/NewHat/io.vn.hatai.newhat.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.vn.hatai.newhat.plist
```

Hệ thống đã được cấu hình chạy ở chế độ **Siêu tối ưu RAM** (~500MB RAM khi chờ):
- **Hybrid STT (Port 9000)**: Ưu tiên dùng Groq Cloud (0 MB RAM). Chỉ tự động bật Local Whisper.cpp (dùng Metal GPU) khi Groq lỗi.
- **Lazy Load TTS (Port 8880 & 5001)**: Các model AI nặng (LuxTTS, Piper) chỉ được nạp vào RAM khi bạn thực sự nhấn nút nghe.
- **Spotlight Exclude**: Đã chặn macOS đánh chỉ mục thư mục dự án để giảm tải `mds_stores`.
- **Node.js**: Giới hạn Heap 2GB và dùng bản Standalone siêu gọn.

#### Cấu hình Groq Cloud (Khuyên dùng):
Để đạt tốc độ STT nhanh nhất và RAM nhẹ nhất, thêm vào file `.env`:
```bash
GROQ_API_KEY=gsk_your_api_key_here
```

### Cập nhật bản Build mới:
Mỗi khi sửa code, bạn cần build lại để bản Standalone được cập nhật:
```bash
npm run build
# Sau đó chạy ./start.sh hoặc restart Agent
```

## 🔧 Cài đặt & Cấu hình

### Biến môi trường (.env.local)
```
JWT_SECRET=6f5be3de25c9a040b79b5218d8be5bf1...
AI_SERVER=http://192.168.1.9:8080
LUXTTS_SERVER=http://localhost:8880
PIPER_SERVER=http://localhost:5001
```

### TTS Servers

#### LuxTTS (Tiếng Anh)
- Port: 8880
- Voices: paul, en_female, en_male, en_us
- Tự động khởi động qua start.sh

#### Piper TTS (Tiếng Việt)
- Port: 5001
- Voice: vi_female (vi_VN-vais1000-medium)
- Tự động khởi động qua start.sh với conda env `hatai_env`
- Voice models: `/Users/nguyenhat/NewHat/piper_voices/`

Để thêm voice mới, xem: `piper_voices/README.md`

#### Edge TTS (Microsoft Neural — Hoài My / Nam Minh)
- **Không cần server riêng** — kết nối trực tiếp qua API Microsoft
- Chạy qua script Python: `edge_tts_helper.py`
- **Python yêu cầu**: `/Users/nguyenhat/miniconda3/bin/python3` (base conda env)
  > ⚠️ **Lưu ý quan trọng**: Dùng **miniconda base env** (`miniconda3/bin/python3`), **KHÔNG** dùng `hatai_env` vì Python 3.10 trong `hatai_env` bị macOS SIGKILL (exit 137) khi chạy asyncio.
- Cài đặt thư viện:
  ```bash
  pip install edge-tts  # hoặc: pip install -r requirements.txt
  ```
- Voices hỗ trợ:
  - `vi-VN-HoaiMyNeural` — Giọng nữ (Hoài My)
  - `vi-VN-NamMinhNeural` — Giọng nam (Nam Minh)

### Database
Khởi tạo cấu trúc bảng:
```bash
npx prisma db push
```

## 📈 Quản lý Quy trình (PM2 - Khuyên dùng)
Để quản lý app chuyên nghiệp và tự động restart khi lỗi:
```bash
npm install -g pm2
pm2 start .next/standalone/server.js --name "newhat-app" --max-memory-restart 2G --env PORT=8006
pm2 save
```

## 📄 License
Hạt
