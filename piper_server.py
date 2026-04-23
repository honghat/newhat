#!/usr/bin/env python3
"""
Piper TTS HTTP Server
Hỗ trợ cả tiếng Anh và tiếng Việt
"""
import os
from flask import Flask, request, send_file, jsonify
from piper import PiperVoice
import io
import wave

app = Flask(__name__)

# Đường dẫn đến voice models
VOICE_DIR = os.path.join(os.path.dirname(__file__), 'piper_voices')

# Load voices
voices = {}

def load_voice(name, model_path):
    """Load a Piper voice model"""
    try:
        voice = PiperVoice.load(model_path)
        voices[name] = voice
        print(f"✓ Loaded voice: {name}")
        return True
    except Exception as e:
        print(f"✗ Failed to load {name}: {e}")
        return False

# Load Vietnamese voice
vi_model = os.path.join(VOICE_DIR, 'vi_VN-vais1000-medium.onnx')
if os.path.exists(vi_model):
    load_voice('vi_female', vi_model)

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'voices': list(voices.keys()),
        'loaded': len(voices) > 0
    })

@app.route('/v1/audio/speech', methods=['POST'])
def synthesize():
    """Synthesize speech from text"""
    data = request.json
    text = data.get('text', '')
    voice_name = data.get('voice', 'vi_female')
    speed = data.get('speed', 1.0)

    if not text:
        return jsonify({'error': 'No text provided'}), 400

    if voice_name not in voices:
        return jsonify({'error': f'Voice {voice_name} not found'}), 404

    try:
        voice = voices[voice_name]
        from piper.config import SynthesisConfig

        # Synthesis configuration
        config = SynthesisConfig(length_scale=1.0/speed)

        # Synthesize audio chunks
        audio_bytes = io.BytesIO()
        with wave.open(audio_bytes, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(voice.config.sample_rate)

            for chunk in voice.synthesize(text, config):
                wav_file.writeframes(chunk.audio_int16_bytes)

        audio_bytes.seek(0)
        return send_file(
            audio_bytes,
            mimetype='audio/wav',
            as_attachment=False,
            download_name='speech.wav'
        )
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/voices', methods=['GET'])
def list_voices():
    """List available voices"""
    return jsonify(list(voices.keys()))

if __name__ == '__main__':
    print("🎙️  Piper TTS Server")
    print(f"📁 Voice directory: {VOICE_DIR}")
    print(f"🗣️  Loaded voices: {list(voices.keys())}")
    print("🌐 Starting server on http://localhost:5001")
    app.run(host='0.0.0.0', port=5001, debug=False)
