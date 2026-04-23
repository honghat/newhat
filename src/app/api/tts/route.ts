const LUXTTS = process.env.LUXTTS_SERVER || 'http://localhost:8880';
const PIPER  = process.env.PIPER_SERVER  || 'http://localhost:5001';

// LuxTTS lazy-load model lần đầu có thể mất 60–90 giây
const TTS_TIMEOUT_MS = 90_000;

/** Thử POST tới một TTS server, trả về Response nếu thành công, null nếu lỗi */
async function tryTTS(
  serverUrl: string,
  body: { text: string; voice: string; speed: number },
): Promise<Response | null> {
  try {
    const res = await fetch(`${serverUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    if (res.ok) return res;
    // Log HTTP lỗi từ TTS server để dễ debug
    const errText = await res.text().catch(() => '');
    console.warn(`[TTS] ${serverUrl} → HTTP ${res.status}: ${errText.slice(0, 200)}`);
    return null;
  } catch (e) {
    console.warn(`[TTS] ${serverUrl} → ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// Health check — kiểm tra cả hai server
export async function GET() {
  const luxOk = await fetch(`${LUXTTS}/health`, { signal: AbortSignal.timeout(3000) })
    .then(r => r.ok).catch(() => false);
  const piperOk = await fetch(`${PIPER}/health`, { signal: AbortSignal.timeout(3000) })
    .then(r => r.ok).catch(() => false);
  return Response.json({ available: luxOk || piperOk, luxtts: luxOk, piper: piperOk });
}

export async function POST(req: Request) {
  const { text, voice = 'default', speed = 1.0, lang } = await req.json();

  // Detect language: use explicit 'lang' if provided, otherwise auto-detect
  let isVietnamese = false;
  if (lang === 'vi') {
    isVietnamese = true;
  } else if (lang === 'en') {
    isVietnamese = false;
  } else {
    isVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
  }

  const primary        = isVietnamese ? PIPER   : LUXTTS;
  const fallback       = isVietnamese ? LUXTTS  : PIPER;
  const primaryVoice   = isVietnamese ? 'vi_female' : voice;
  const fallbackVoice  = isVietnamese ? voice        : 'vi_female';

  // 1️⃣ Thử server chính
  let res = await tryTTS(primary, { text, voice: primaryVoice, speed });

  // 2️⃣ Fallback sang server còn lại nếu server chính không phản hồi
  if (!res) {
    console.warn(`[TTS] Primary (${primary}) failed, trying fallback (${fallback})`);
    res = await tryTTS(fallback, { text, voice: fallbackVoice, speed });
  }

  if (res) {
    const audio = await res.arrayBuffer();
    return new Response(audio, {
      headers: {
        'Content-Type': res.headers.get('Content-Type') || 'audio/wav',
        'Cache-Control': 'no-cache',
      },
    });
  }

  // Cả hai đều offline → 503, client sẽ tự fallback sang browser TTS
  console.error('[TTS] Cả LuxTTS lẫn Piper đều không phản hồi → 503');
  return Response.json(
    { error: 'TTS offline: cả LuxTTS lẫn Piper đều không phản hồi' },
    { status: 503 },
  );
}
