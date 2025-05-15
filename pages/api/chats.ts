import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // List all chats with id, initial user prompt, and timestamp
  const chats = await prisma.chat.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      messages: {
        where: { type: 'user' },
        orderBy: { timestamp: 'asc' },
        take: 1,
      },
    },
  });
  const chatList = chats.map((chat) => ({
    chat_id: chat.id,
    initial_prompt: chat.messages[0]?.text || '(no prompt)',
    timestamp: chat.messages[0]?.timestamp || chat.createdAt,
  }));
  res.json(chatList);
} 