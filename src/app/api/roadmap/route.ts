import { prisma } from '@/lib/prisma';

export async function GET() {
  const items = await prisma.roadmapItem.findMany({ where: { completed: true }, select: { id: true } });
  return Response.json(items.map(i => i.id));
}

export async function POST(req: Request) {
  const { id, completed } = await req.json();
  const item = await prisma.roadmapItem.upsert({
    where: { id },
    update: { completed },
    create: { id, completed },
  });
  return Response.json(item);
}
