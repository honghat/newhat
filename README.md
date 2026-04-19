# NewHat — 60 Ngày Thay Đổi

Ứng dụng học Full-Stack & Tiếng Anh trong 60 ngày với AI hỗ trợ.

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
- **Copy button**: Nhanh chóng copy code từ kết quả

### 🇬🇧 Tiếng Anh (English)
- **Luyện nói (Speaking)**: 
  - Tạo chủ đề ngẫu nhiên
  - Ghi âm & nhận diện giọng nói (Whisper)
  - Nhận feedback từ AI
- **Luyện viết (Writing)**:
  - Tạo bài viết
  - Nộp bài & nhận feedback
- **Tra từ (Dictionary)**:
  - Hỏi AI giải thích từ vựng
  - Lưu lịch sử tra cứu
- **Chế độ học**: Filter theo coder/communication/business/IELTS
- **TTS**: Nghe phát âm với giọng đọc (LuxTTS)

### 👤 Quản lý Tài khoản (Admin)
- Duyệt/từ chối đăng ký
- Thay đổi quyền (user/admin)
- **Sửa tài khoản**: Thay đổi tên, email, mật khẩu
- Xóa người dùng

## 🚀 Cổng Dịch Vụ

| Cổng | Dịch vụ | Mô tả |
|------|---------|-------|
| **8006** | Next.js App | Web chính — `http://localhost:8006` |
| **8880** | LuxTTS + Whisper | TTS (giọng đọc) + STT (nhận dạng giọng nói) |
| **5432** | PostgreSQL | Database — `newhat@localhost` |
| **8080** | AI Server (remote) | LLM tại `192.168.1.9:8080` |
| **9000** | Whisper Server | STT riêng biệt (Whisper medium) |

## ⚡ Khởi động

```bash
./start.sh
```

Script tự động:
1. Khởi động PostgreSQL
2. Khởi động LuxTTS + Whisper (port 8880)
3. Kiểm tra AI Server (192.168.1.9:8080)
4. Khởi động Next.js (port 8006)

## 🔧 Audio Server (LuxTTS/)

```
LuxTTS/
├── server.py       # FastAPI server: TTS + Whisper STT
├── voices/         # File giọng mẫu .wav
└── requirements.txt
```

**Endpoints:**
- `POST /v1/audio/speech` — Text-to-Speech
- `POST /v1/audio/transcriptions` — Speech-to-Text (Whisper medium)
- `GET /health` — Kiểm tra trạng thái

**Cài dependencies:**
```bash
cd LuxTTS && pip install -e . && pip install faster-whisper librosa soundfile
```

## 🗄️ Database Schema

**Bảng chính:**
- `User` — Người dùng (name, email, password, role, status)
- `Lesson` — Bài học lập trình
- `EnglishLesson` — Bài học tiếng Anh (speaking, writing, vocabulary)
- `CodeSession` — Lịch sử giải thích/tạo code
- `DayLog` — Nhật ký học tập hàng ngày
- `AIReport` — Báo cáo AI
- `PomodoroSession` — Phiên Pomodoro
- `RoadmapItem` — Mục tiêu học tập

## 📱 Tối ưu Mobile

- Responsive design cho iPhone/tablet
- Status bar safe-area padding (iOS)
- Icon-only buttons trên mobile
- Tab wrapping thay vì scroll
- Timeout AI: 5 phút
- Copy button trên code blocks

## 🔑 Biến môi trường (.env.local)

```
DATABASE_URL=postgresql://newhat_user:newhat123@localhost:5432/newhat
AI_SERVER=http://192.168.1.9:8080
LUXTTS_SERVER=http://localhost:8880
JWT_SECRET=your-secret-key
WHISPER_MODEL=medium
```

## 💻 Máy AI Local (192.168.1.9)

- Wake-on-LAN MAC: `9c:6b:00:17:93:7a`
- SSH: `hatnguyen@192.168.1.9`
- Tắt/bật qua nút trên trang chủ

## 📖 Routes chính

| Route | Chức năng |
|-------|----------|
| `/` | Dashboard chính |
| `/learn` | Bài học lập trình + giải thích code |
| `/english` | Luyện tiếng Anh (speaking/writing/vocabulary) |
| `/admin` | Quản lý người dùng |
| `/profile` | Hồ sơ cá nhân |
| `/roadmap` | Bản đồ kỹ năng |
| `/timer` | Pomodoro timer |

## 🎨 Ngôn ngữ được hỗ trợ

HTML/CSS, JavaScript, TypeScript, React, Next.js, Node.js, Python, FastAPI, Java, Kotlin, C#/.NET, C++, Go, Rust, PHP, Ruby, Swift, Dart/Flutter, SQL/PostgreSQL, Git, REST API, Docker, Linux/Bash, Excel VBA, Power BI

## 📄 License

Private project
