const LUXTTS = process.env.LUXTTS_SERVER || 'http://localhost:8880';
const PIPER = process.env.PIPER_SERVER || 'http://localhost:5001';

// Lightweight health check — no synthesis, just ping
export async function GET() {
  try {
    const res = await fetch(`${LUXTTS}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) return Response.json({ available: true });
    // Some servers don't expose /health — try OPTIONS on speech endpoint
    const res2 = await fetch(`${LUXTTS}/v1/audio/speech`, { method: 'OPTIONS', signal: AbortSignal.timeout(2000) }).catch(() => null);
    return Response.json({ available: !!res2 });
  } catch {
    return Response.json({ available: false });
  }
}

export async function POST(req: Request) {
  const { text, voice = 'default', speed = 1.0 } = await req.json();

  // Detect language: if Vietnamese, use Piper; otherwise use LuxTTS
  const isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
  const server = isVietnamese ? PIPER : LUXTTS;
  const voiceToUse = isVietnamese ? 'vi_female' : voice;

  try {
    const res = await fetch(`${server}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voiceToUse, speed }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);
    const audio = await res.arrayBuffer();
    return new Response(audio, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'audio/wav',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `TTS offline: ${msg}` }, { status: 503 });
  }
}
