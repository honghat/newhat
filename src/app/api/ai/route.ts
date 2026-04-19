import { prisma } from '@/lib/prisma';
import { execSync } from 'child_process';

async function getAIBase(): Promise<string> {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    if (s?.aiServer) return s.aiServer;
  } catch {}
  return process.env.AI_SERVER || 'http://100.69.50.64:8080';
}

export async function POST(req: Request) {
  const AI_BASE = await getAIBase();
  try {
    const body = await req.json();
    const payload = JSON.stringify({ model: 'default', temperature: 0.7, ...body });
    const raw = execSync(
      `curl -s -X POST "${AI_BASE}/v1/chat/completions" -H "Content-Type: application/json" -d '${payload.replace(/'/g, "'\\''")}'`,
      { timeout: 300000, encoding: 'utf8' }
    );
    const data = JSON.parse(raw);
    return Response.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[AI route error]', msg.slice(0, 200));
    return Response.json(
      { error: `AI offline: ${msg.slice(0, 100)}`, choices: [{ message: { content: `⚠️ AI server không phản hồi (${AI_BASE}). Kiểm tra server đang chạy chưa.` } }] },
      { status: 503 }
    );
  }
}
