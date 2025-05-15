import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma'; // Path relative to pages/api/
import { Chat } from '@prisma/client';

interface ChatListItem extends Chat {
  initialPromptPreview?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatListItem[] | { error: string; details?: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const chats = await prisma.chat.findMany({
      orderBy: {
        createdAt: 'desc', // Show newest chats first
      },
    });

    const chatListItems: ChatListItem[] = [];

    for (const chat of chats) {
      const firstUserMessage = await prisma.message.findFirst({
        where: {
          chatId: chat.id,
          type: 'user', // Assuming 'user' type for user messages
        },
        orderBy: {
          timestamp: 'asc',
        },
      });
      chatListItems.push({
        ...chat,
        initialPromptPreview: firstUserMessage?.text.substring(0, 100) || '(No user messages yet)', // Preview of first 100 chars
      });
    }

    res.status(200).json(chatListItems);
  } catch (error) {
    console.error('Error fetching chat list:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching chat list.';
    res.status(500).json({ error: 'Failed to fetch chat list.', details: errorMessage });
  }
} 