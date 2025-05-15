import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Message } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<Message[] | { error: string; details?: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { chatId } = req.query;

  if (!chatId || typeof chatId !== 'string') {
    return res.status(400).json({ error: 'Chat ID is required and must be a string.' });
  }

  try {
    const messages = await prisma.message.findMany({
      where: {
        chatId: chatId,
      },
      orderBy: {
        timestamp: 'asc', // Get messages in chronological order
      },
    });

    // findMany returns an empty array if no records are found, not null or undefined.
    // So, a 404 specifically for "no messages" isn't strictly necessary unless you want to distinguish
    // between "chat exists but has no messages" and "chat doesn't exist at all".
    // For simplicity, returning an empty array for no messages is fine and standard.
    // If you wanted to check if the chat itself exists first, you could add a prisma.chat.findUnique call.

    res.status(200).json(messages);
  } catch (error) {
    console.error(`Error fetching chat history for Chat ID ${chatId}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching chat history.';
    res.status(500).json({ error: 'Failed to fetch chat history.', details: errorMessage });
  } finally {
    await prisma.$disconnect(); // Consider global Prisma instance for optimization
  }
} 