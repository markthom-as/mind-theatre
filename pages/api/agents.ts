import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const agents = await prisma.agent.findMany({ select: { name: true } });
  res.json(agents.map(a => a.name));
} 