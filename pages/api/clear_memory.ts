import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma'; // Use the shared Prisma instance

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === 'POST') {
    try {
      // Start a transaction to ensure all deletions succeed or fail together
      // Order: Messages (depends on Chat), then Chat, then Memory (independent)
      const [messageDeletion, chatDeletion, memoryDeletion] = await prisma.$transaction([
        prisma.message.deleteMany({}),
        prisma.chat.deleteMany({}),
        prisma.memory.deleteMany({})
      ]);

      res.status(200).json({
        status: 'success',
        message: 'All chat sessions, messages, and episodic memories cleared.',
        details: {
          deletedMessages: messageDeletion.count,
          deletedChats: chatDeletion.count,
          deletedMemories: memoryDeletion.count,
        }
      });
    } catch (error) {
      console.error('Error in /api/clear_memory:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear all memory.';
      res.status(500).json({ status: 'error', message: errorMessage });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 