# Piper TTS Voices

Thư mục này chứa các voice models cho Piper TTS.

## Voice hiện có

### Tiếng Việt
- **vi_VN-vais1000-medium** - Giọng nữ tiếng Việt
  - Model: `vi_VN-vais1000-medium.onnx`
  - Config: `vi_VN-vais1000-medium.onnx.json`
  - Kích thước: ~60MB

## Thêm voice mới

Để thêm voice mới, tải từ [Piper Voices Repository](https://huggingface.co/rhasspy/piper-voices/tree/main):

```bash
# Ví dụ: Tải voice tiếng Anh
curl -L -o en_US-lessac-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx
curl -L -o en_US-lessac-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json
```

Sau đó cập nhật `piper_server.py` để load voice mới.

## Danh sách ngôn ngữ hỗ trợ

Xem đầy đủ tại: https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/VOICES.md

Một số ngôn ngữ phổ biến:
- Tiếng Việt (vi_VN)
- English (en_US, en_GB)
- 中文 (zh_CN)
- 日本語 (ja_JP)
- 한국어 (ko_KR)
- Français (fr_FR)
- Deutsch (de_DE)
- Español (es_ES)
- Português (pt_BR)
- Русский (ru_RU)
