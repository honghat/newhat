import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return Response.json([]);
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  try {
    const where = type ? { userId: user.id, type } : { userId: user.id };
    const lessons = await prisma.englishLesson.findMany({
      where, orderBy: { order: 'asc' }, take: 100,
    });
    return Response.json(lessons);
  } catch { return Response.json([]); }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { type, content, metadata = {} } = await req.json();
    const lesson = await prisma.englishLesson.create({
      data: { type, content, metadata: JSON.stringify(metadata), userId: user.id },
    });
    return Response.json(lesson);
  } catch (e: unknown) {
    console.error('[english POST error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { id, completed, content, metadata } = await req.json();
    const data: any = {};
    if (completed !== undefined) data.completed = completed;
    if (content !== undefined) data.content = content;
    if (metadata !== undefined) data.metadata = JSON.stringify(metadata);
    const lesson = await prisma.englishLesson.update({
      where: { id, userId: user.id },
      data,
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
    await prisma.englishLesson.delete({ where: { id, userId: user.id } });
    return Response.json({ ok: true });
  } catch (e: unknown) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
