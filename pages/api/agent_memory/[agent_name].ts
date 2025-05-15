import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { agent_name } = req.query;
  if (!agent_name || typeof agent_name !== 'string') {
    return res.status(400).json({ error: 'Invalid agent_name' });
  }
  const agent = await prisma.agent.findUnique({ where: { name: agent_name } });
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  const messages = await prisma.message.findMany({
    where: { agentId: agent.id },
    orderBy: { timestamp: 'desc' },
  });
  res.json(messages);
} 