import { NextResponse } from 'next/server';

const LUXTTS = process.env.LUXTTS_SERVER || 'http://localhost:8880';
const PIPER  = process.env.PIPER_SERVER  || 'http://localhost:5001';
const EDGETTS = 'native'; // Dùng Python edge-tts trực tiếp, không qua HTTP server

const TTS_TIMEOUT_MS = 90_000;

/** Gọi Python edge-tts trực tiếp, dùng streaming để giảm latency */
async function tryEdgeTTS(text: string, voice: string, speed: number): Promise<Response | null> {
  const { spawn } = require('child_process');
  const pythonPath = '/Users/nguyenhat/miniconda3/bin/python3';
  const helperPath = '/Users/nguyenhat/NewHat/edge_tts_helper.py';

  const rateStr = speed >= 1.0 ? `+${Math.round((speed - 1) * 100)}%` : `-${Math.round((1 - speed) * 100)}%`;
  const params = JSON.stringify({ text, voice, rate: rateStr });

  return new Promise((resolve) => {
    const child = spawn(pythonPath, [helperPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    let errorData = '';

    child.stdout.on('data', (data: Buffer) => { chunks.push(data); });
    child.stderr.on('data', (data: any) => { errorData += data.toString(); });
    child.stdin.write(params, 'utf8');
    child.stdin.end();

    child.on('close', (code: number) => {
      if (code !== 0) {
        console.error(`[EdgeTTS] Failed: ${errorData}`);
        resolve(null);
      } else {
        const audioBuffer = Buffer.concat(chunks);
        if (audioBuffer.length > 0) {
          resolve(new Response(audioBuffer, { headers: { 'Content-Type': 'audio/mpeg' } }));
        } else resolve(null);
      }
    });
    child.on('error', () => resolve(null));
  });
}

async function tryTTS(
  serverUrl: string,
  body: { text: string; voice: string; speed: number },
): Promise<Response | null> {
  try {
    const isEdge = serverUrl === EDGETTS;
    if (isEdge) {
      let voice = body.voice;
      if (voice === 'vi_female' || voice === 'default') voice = 'vi-VN-HoaiMyNeural';
      else if (voice === 'vi_male') voice = 'vi-VN-NamMinhNeural';
      return await tryEdgeTTS(body.text, voice, body.speed);
    }

    const isLux = serverUrl.includes('8880') || serverUrl === LUXTTS;
    const payload = isLux ? { text: body.text, voice: body.voice, speed: body.speed } : body;

    const res = await fetch(`${serverUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });

    if (res.ok) return res;
    return null;
  } catch (e) {
    return null;
  }
}

export async function GET() {
  const [luxOk, piperOk] = await Promise.all([
    fetch(`${LUXTTS}/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.ok).catch(() => false),
    fetch(`${PIPER}/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.ok).catch(() => false),
  ]);
  const { execSync } = require('child_process');
  let edgeOk = false;
  try {
    execSync('/Users/nguyenhat/miniconda3/bin/python3 -c "import edge_tts"', { timeout: 3000 });
    edgeOk = true;
  } catch {}
  return Response.json({ available: luxOk || piperOk || edgeOk, luxtts: luxOk, piper: piperOk, edgetts: edgeOk });
}

export async function POST(req: Request) {
  const { text, voice = 'default', speed = 1.0, lang, server } = await req.json();
  let isVietnamese = lang === 'vi' || (lang !== 'en' && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text));

  let chain = [EDGETTS, PIPER, LUXTTS];
  let allowFallback = true;

  if (server === 'edge') { chain = [EDGETTS]; allowFallback = false; }
  else if (server === 'piper') { chain = [PIPER]; allowFallback = false; }
  else if (server === 'luxtts') { chain = [LUXTTS]; allowFallback = false; }
  else if (server === 'google') {
    try {
      const chunks = text.match(/[\s\S]{1,200}(?=\s|$)|[\s\S]{1,200}/g) || [text];
      const buffers = await Promise.all(chunks.map(async (chunk: string) => {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(chunk)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        return res.arrayBuffer();
      }));
      const totalLen = buffers.reduce((acc, b) => acc + b.byteLength, 0);
      const combined = new Uint8Array(totalLen);
      let offset = 0;
      for (const b of buffers) { combined.set(new Uint8Array(b), offset); offset += b.byteLength; }
      return new Response(combined, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' } });
    } catch { chain = [EDGETTS, PIPER, LUXTTS]; }
  }

  let primaryVoice = voice;
  if (voice === 'default') primaryVoice = isVietnamese ? 'vi-VN-HoaiMyNeural' : 'en-US-AvaNeural';
  else if (voice === 'vi_female') primaryVoice = 'vi-VN-HoaiMyNeural';
  else if (voice === 'vi_male') primaryVoice = 'vi-VN-NamMinhNeural';

  let res: Response | null = null;
  for (const serverItem of chain) {
    res = await tryTTS(serverItem, { text, voice: primaryVoice, speed });
    if (res) break;
    if (!allowFallback) break;
  }

  if (res) {
    const audio = await res.arrayBuffer();
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' } });
  }
  return Response.json({ error: 'TTS offline' }, { status: 503 });
}
