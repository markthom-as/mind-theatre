import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await prisma.message.deleteMany({});
    await prisma.chat.deleteMany({});
    res.json({ status: 'success', message: 'Memory cleared.' });
  } catch (e) {
    res.status(500).json({ status: 'error', message: 'Memory store not initialized.' });
  }
} 