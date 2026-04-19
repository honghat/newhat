import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth';

async function getOrCreate() {
  let s = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!s) s = await prisma.settings.create({ data: { id: 1 } });
  return s;
}

export async function GET() {
  try {
    const s = await getOrCreate();
    return Response.json({ aiServer: s.aiServer, aiHost: s.aiHost });
  } catch (e) {
    console.error('[settings GET error]', e);
    return Response.json({ aiServer: process.env.AI_SERVER || 'http://100.69.50.64:8080', aiHost: '100.69.50.64' });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSession();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const { aiServer, aiHost } = await req.json();
    const data: { aiServer?: string; aiHost?: string } = {};
    if (typeof aiServer === 'string' && aiServer.trim()) data.aiServer = aiServer.trim();
    if (typeof aiHost === 'string' && aiHost.trim()) data.aiHost = aiHost.trim();

    const s = await prisma.settings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
    return Response.json({ aiServer: s.aiServer, aiHost: s.aiHost });
  } catch (e: unknown) {
    console.error('[settings POST error]', e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
