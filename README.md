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

### 🇬🇧 Tiếng Anh (English)
- **Luyện nói (Speaking)**: Ghi âm & nhận diện giọng nói (Whisper), nhận feedback từ AI
- **Luyện viết (Writing)**: Tạo bài viết & nhận feedback
- **TTS đa ngôn ngữ**: 
  - Tiếng Anh: LuxTTS (giọng tự nhiên)
  - Tiếng Việt: Piper TTS (giọng chuẩn)

## 🚀 Cổng Dịch Vụ

| Cổng | Dịch vụ | Mô tả |
|------|---------|-------|
| **8006** | Next.js App | Web chính (Standalone Mode) |
| **8880** | LuxTTS | TTS tiếng Anh |
| **5001** | Piper TTS | TTS tiếng Việt |
| **9000** | Whisper | STT (Speech-to-Text) |
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

## 🧠 Tối ưu hóa Bộ nhớ (RAM)

Hệ thống đã được cấu hình chạy ở chế độ **Standalone Mode** siêu nhẹ (~1.4GB RAM tổng):
- **Node.js**: Giới hạn Heap 2GB (`--max-old-space-size=2048`).
- **System**: Giới hạn bộ nhớ ảo 8GB (`ulimit`).
- **Build**: Sử dụng `.next/standalone` để giảm tải `node_modules`.

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
