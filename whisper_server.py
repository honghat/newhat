#!/usr/bin/env python3
"""
Whisper STT Server — compatible với OpenAI /v1/audio/transcriptions API
Chạy: python3 whisper_server.py
Port: 9000
"""
import os, tempfile, traceback
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MODEL_SIZE = os.environ.get("WHISPER_MODEL", "medium")  # tiny/base/small/medium
DEVICE     = os.environ.get("WHISPER_DEVICE", "cpu")   # cpu / cuda
PORT       = int(os.environ.get("WHISPER_PORT", "9000"))

# Fix PATH for Homebrew ffmpeg on Mac
os.environ["PATH"] += os.path.pathsep + "/opt/homebrew/bin" + os.path.pathsep + "/usr/local/bin"

print(f"⏳ Đang tải Whisper model '{MODEL_SIZE}' trên {DEVICE}...")
whisper = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type="int8")
print(f"✅ Whisper '{MODEL_SIZE}' sẵn sàng tại http://localhost:{PORT}")

app = FastAPI(title="Whisper STT Server")

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE}

@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: str = Form("base"),
    language: str = Form("en"),
    response_format: str = Form("json"),
):
    try:
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        segments, info = whisper.transcribe(tmp_path, language=language or None, beam_size=3)
        text = " ".join(s.text.strip() for s in segments).strip()
        os.unlink(tmp_path)

        if response_format == "text":
            return text
        return JSONResponse({"text": text, "language": info.language})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=500)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
