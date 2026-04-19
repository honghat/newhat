import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return Response.json([]);
    const lessons = await prisma.lesson.findMany({
      where: { userId: user.id },
      orderBy: { order: 'asc' },
      select: { id: true, track: true, topic: true, content: true, order: true, completed: true, createdAt: true },
    });
    return Response.json(lessons);
  } catch {
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { topic, content, track } = await req.json();
    console.log('[lessons POST]', { userId: user.id, track, topic: topic?.slice(0, 50), contentLen: content?.length });
    if (!topic || !content) {
      return Response.json({ error: 'Missing topic or content' }, { status: 400 });
    }
    const userExists = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
    if (!userExists) {
      return Response.json({ error: `User ${user.id} not found in DB (stale session)` }, { status: 401 });
    }
    // Check duplicate: same user + same track + same topic
    const dup = await prisma.lesson.findFirst({
      where: { userId: user.id, track: track || 'javascript', topic },
      select: { id: true, topic: true, content: true, track: true, order: true, completed: true, createdAt: true },
    });
    if (dup) {
      return Response.json({ ...dup, duplicate: true });
    }
    const lesson = await prisma.lesson.create({ data: { topic, content, track: track || 'javascript', userId: user.id } });
    return Response.json(lesson);
  } catch (e: unknown) {
    console.error('[lessons POST error]', e);
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, completed } = await req.json();
    const lesson = await prisma.lesson.update({
      where: { id, userId: user.id },
      data: { completed },
      select: { id: true, completed: true, order: true },
    });
    return Response.json(lesson);
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await req.json();
    await prisma.lesson.delete({ where: { id, userId: user.id } });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
