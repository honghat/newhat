import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getSession();
    if (!user) return Response.json([]);
    const logs = await prisma.dayLog.findMany({
      where: { userId: user.id },
      orderBy: { date: 'desc' },
    });
    const cleaned = logs.map(l => ({ ...l, hours: Math.round(l.hours * 10) / 10 }));
    return Response.json(cleaned);
  } catch (e: unknown) {
    console.error('[logs GET error]', e);
    return Response.json([]);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { date, hours, topic, notes } = await req.json();
    const log = await prisma.dayLog.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { hours, topic, notes },
      create: { userId: user.id, date, hours, topic, notes },
    });
    const allLogs = await prisma.dayLog.aggregate({ where: { userId: user.id }, _sum: { hours: true } });
    await prisma.missionConfig.updateMany({
      where: { userId: user.id },
      data: { totalHours: allLogs._sum.hours || 0 },
    });
    return Response.json(log);
  } catch (e: unknown) {
    console.error('[logs POST error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const { date, addHours, addTopic } = await req.json();
    const existing = await prisma.dayLog.findUnique({ where: { userId_date: { userId: user.id, date } } });
    const newHours = Math.round(Math.min(16, (existing?.hours ?? 0) + (addHours ?? 0)) * 10) / 10;
    const existingTopics = existing?.topic ? existing.topic.split(', ') : [];
    let newTopics = [...existingTopics, addTopic].slice(-50);
    const log = await prisma.dayLog.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { hours: newHours, topic: newTopics.join(', ') },
      create: { userId: user.id, date, hours: newHours, topic: newTopics.join(', '), notes: '' },
    });
    const allLogs = await prisma.dayLog.aggregate({ where: { userId: user.id }, _sum: { hours: true } });
    await prisma.missionConfig.updateMany({
      where: { userId: user.id },
      data: { totalHours: allLogs._sum.hours || 0 },
    });
    return Response.json(log);
  } catch (e: unknown) {
    console.error('[logs PATCH error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
