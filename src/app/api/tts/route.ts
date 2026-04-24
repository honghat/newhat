import { NextResponse } from 'next/server';

const LUXTTS = process.env.LUXTTS_SERVER || 'http://localhost:8880';
const PIPER  = process.env.PIPER_SERVER  || 'http://localhost:5001';
const EDGETTS_SERVER = 'http://127.0.0.1:5002'; // Persistent Edge TTS server
const PYTHON = '/Users/nguyenhat/miniconda3/bin/python3';
const HELPER = '/Users/nguyenhat/NewHat/edge_tts_helper.py';
const TTS_TIMEOUT_MS = 180_000; // Tăng lên 3 phút cho máy yếu

/** Gọi Edge TTS persistent server (siêu nhanh, không spawn Python) */
async function tryEdgeServer(text: string, voice: string, speed: number): Promise<Response | null> {
  const rateStr = speed >= 1.0 ? `+${Math.round((speed - 1) * 100)}%` : `-${Math.round((1 - speed) * 100)}%`;
  try {
    const res = await fetch(`${EDGETTS_SERVER}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate: rateStr }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    if (res.ok) return res;
    return null;
  } catch {
    return null;
  }
}

/** Fallback: gọi Python edge-tts trực tiếp (chậm hơn nhưng luôn hoạt động) */
async function tryEdgeSpawn(text: string, voice: string, speed: number): Promise<Response | null> {
  const { spawn } = require('child_process');
  const rateStr = speed >= 1.0 ? `+${Math.round((speed - 1) * 100)}%` : `-${Math.round((1 - speed) * 100)}%`;
  const params = JSON.stringify({ text, voice, rate: rateStr });

  return new Promise((resolve) => {
    const child = spawn(PYTHON, [HELPER], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];

    child.stdout.on('data', (d: Buffer) => chunks.push(d));
    child.stdin.write(params, 'utf8');
    child.stdin.end();

    const timeout = setTimeout(() => { child.kill(); resolve(null); }, TTS_TIMEOUT_MS);

    child.on('close', (code: number) => {
      clearTimeout(timeout);
      if (code !== 0) { resolve(null); return; }
      const buf = Buffer.concat(chunks);
      resolve(buf.length > 0 ? new Response(buf, { headers: { 'Content-Type': 'audio/mpeg' } }) : null);
    });
    child.on('error', () => { clearTimeout(timeout); resolve(null); });
  });
}

/** Gọi Edge TTS: thử server trước, fallback spawn */
async function tryEdgeTTS(text: string, voice: string, speed: number): Promise<Response | null> {
  // 1. Thử persistent server (nhanh như chớp)
  const fast = await tryEdgeServer(text, voice, speed);
  if (fast) return fast;
  
  // 2. Fallback: spawn Python (chậm hơn nhưng luôn hoạt động)
  console.log('[EdgeTTS] Server offline, fallback to spawn...');
  return await tryEdgeSpawn(text, voice, speed);
}

async function tryTTS(
  serverUrl: string,
  body: { text: string; voice: string; speed: number },
): Promise<Response | null> {
  try {
    if (serverUrl === 'edge') {
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
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const text = searchParams.get('text');
  if (!text) return Response.json({ error: 'No text' }, { status: 400 });

  // Health check
  if (text === '__health__') {
    const [luxOk, piperOk, edgeOk] = await Promise.all([
      fetch(`${LUXTTS}/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.ok).catch(() => false),
      fetch(`${PIPER}/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.ok).catch(() => false),
      fetch(`${EDGETTS_SERVER}/health`, { signal: AbortSignal.timeout(3000) }).then(r => r.ok).catch(() => false),
    ]);
    return Response.json({ available: luxOk || piperOk || edgeOk, luxtts: luxOk, piper: piperOk, edgetts: edgeOk });
  }

  const voice = searchParams.get('voice') || 'vi-VN-HoaiMyNeural';
  const speed = parseFloat(searchParams.get('speed') || '1.0');
  const server = searchParams.get('server') || 'edge';
  const serverUrl = server === 'piper' ? PIPER : server === 'luxtts' ? LUXTTS : 'edge';

  const res = await tryTTS(serverUrl, { text, voice, speed });
  if (res) {
    const audio = await res.arrayBuffer();
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=3600' } });
  }
  return Response.json({ error: 'TTS failed' }, { status: 500 });
}

export async function POST(req: Request) {
  const { text, voice = 'default', speed = 1.0, lang, server } = await req.json();
  const isVietnamese = lang === 'vi' || (lang !== 'en' && /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text));

  let primaryVoice = voice;
  if (voice === 'default') primaryVoice = isVietnamese ? 'vi-VN-HoaiMyNeural' : 'en-US-AvaNeural';
  else if (voice === 'vi_female') primaryVoice = 'vi-VN-HoaiMyNeural';
  else if (voice === 'vi_male') primaryVoice = 'vi-VN-NamMinhNeural';

  // Cấu hình chuỗi ưu tiên (chain)
  let chain: string[];
  if (server === 'piper') chain = [PIPER];
  else if (server === 'luxtts') chain = [LUXTTS];
  else if (server === 'edge') chain = ['edge']; // Chỉ dùng Edge, không nhảy sang Piper
  else chain = ['edge', PIPER]; // Mặc định nếu không chỉ định rõ

  let res: Response | null = null;
  for (const s of chain) {
    res = await tryTTS(s, { text, voice: primaryVoice, speed });
    if (res) break;
  }

  if (res) {
    const audio = await res.arrayBuffer();
    // Hint for GC: clear local reference early if possible
    res = null; 
    return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' } });
  }
  return Response.json({ error: 'TTS offline' }, { status: 503 });
}
