function getWhisperBase(): string | null {
  const w = process.env.WHISPER_SERVER?.trim();
  if (w) return w;
  return null;
}

// Model name for local Whisper server (e.g. "base", "small", "medium")
// OpenAI-compatible servers use "whisper-1"
const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'medium';

export async function GET() {
  const base = getWhisperBase();
  if (!base) return Response.json({ available: false, reason: 'WHISPER_SERVER not set' });
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    return Response.json({ available: res.ok, url: base, model: WHISPER_MODEL });
  } catch {
    return Response.json({ available: false, reason: 'Server not reachable' });
  }
}

export async function POST(req: Request) {
  const base = getWhisperBase();
  if (!base) {
    return Response.json({ error: 'Whisper server chưa cấu hình. Dùng Browser STT.' }, { status: 503 });
  }
  try {
    const formData = await req.formData();
    const audio = formData.get('audio') as Blob;
    if (!audio) return Response.json({ error: 'No audio' }, { status: 400 });

    const type = audio.type || '';
    let ext = 'webm';
    if (type.includes('mp4')) ext = 'mp4';
    else if (type.includes('ogg')) ext = 'ogg';

    const form = new FormData();
    form.append('file', audio, `audio.${ext}`);
    form.append('model', WHISPER_MODEL);
    form.append('language', 'en');
    form.append('response_format', 'json');

    const res = await fetch(`${base}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return Response.json({ text: data.text || '' });
  } catch (e: unknown) {
    console.error('[STT]', String(e));
    return Response.json({ error: String(e) }, { status: 503 });
  }
}
