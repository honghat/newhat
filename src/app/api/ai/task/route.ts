import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

async function getAIBase(): Promise<string> {
  try {
    const s = await prisma.settings.findUnique({ where: { id: 1 } });
    if (s?.aiServer) return s.aiServer;
  } catch {}
  return process.env.AI_SERVER || 'http://100.69.50.64:8080';
}

function cleanTopic(raw: string): string {
  let t = raw.trim();
  const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  t = lines.find(l => l.includes('?')) || lines[0];
  t = t.replace(/^[*#>\-•\d.]+\s*/, '');
  t = t.replace(/^(topic|question|prompt|here(?:'s| is))[:\s]+/i, '');
  t = t.replace(/^["'"'「『](.*)["'"'」』]$/, '$1');
  t = t.replace(/^["'](.*)["']$/, '$1');
  return t.trim();
}

// Fire AI call in background — response returns immediately with taskId.
// AI result is saved to EnglishLesson when complete, survives client navigation.
export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { type, prompt } = await req.json();
  if (!type || !prompt) return Response.json({ error: 'Missing type or prompt' }, { status: 400 });

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const AI_BASE = await getAIBase();

  // Ghi marker "đang chạy" vào DB để client poll được
  await prisma.englishLesson.create({
    data: {
      userId: user.id,
      type: `${type}_pending`,
      content: taskId,
      metadata: JSON.stringify({ taskId, prompt: prompt.slice(0, 100), status: 'running' }),
    },
  });

  // Chạy nền — không await, response trả về ngay
  (async () => {
    try {
      const res = await fetch(`${AI_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'default', temperature: 0.7,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: AbortSignal.timeout(300000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content || '';
      const cleaned = cleanTopic(rawContent);
      // Xoá marker pending, lưu kết quả thật
      await prisma.englishLesson.deleteMany({
        where: { userId: user.id, type: `${type}_pending`, content: taskId },
      });
      if (cleaned && cleaned.length > 10) {
        await prisma.englishLesson.create({
          data: {
            userId: user.id,
            type,
            content: cleaned,
            metadata: JSON.stringify({ taskId, generated: true }),
          },
        });
      }
    } catch (e) {
      // Đánh dấu lỗi trong marker
      await prisma.englishLesson.updateMany({
        where: { userId: user.id, type: `${type}_pending`, content: taskId },
        data: { metadata: JSON.stringify({ taskId, status: 'error', error: String(e) }) },
      });
    }
  })();

  return Response.json({ taskId });
}

// Client poll để check task xong chưa
export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return Response.json({ status: 'unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const type = searchParams.get('type');
  if (!taskId || !type) return Response.json({ error: 'Missing taskId or type' }, { status: 400 });

  // Còn marker pending → đang chạy
  const pending = await prisma.englishLesson.findFirst({
    where: { userId: user.id, type: `${type}_pending`, content: taskId },
  });
  if (pending) {
    const meta = JSON.parse(pending.metadata || '{}');
    if (meta.status === 'error') {
      await prisma.englishLesson.delete({ where: { id: pending.id } });
      return Response.json({ status: 'error', error: meta.error });
    }
    return Response.json({ status: 'running' });
  }

  // Không còn pending → tìm kết quả
  const result = await prisma.englishLesson.findFirst({
    where: { userId: user.id, type },
    orderBy: { createdAt: 'desc' },
  });
  if (result && result.metadata?.includes(taskId)) {
    return Response.json({ status: 'done', content: result.content });
  }
  return Response.json({ status: 'unknown' });
}
