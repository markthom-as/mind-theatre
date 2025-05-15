import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const newChat = await prisma.chat.create({
      data: {
        // No data needs to be passed as id and createdAt are defaulted
      },
    });
    res.status(201).json({ chatId: newChat.id });
  } catch (error) {
    console.error('Error creating new chat session:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error creating chat session.';
    res.status(500).json({ error: 'Failed to create new chat session.', details: errorMessage });
  } finally {
    // It's good practice to disconnect PrismaClient when not in a serverless environment
    // or when the function instance might be reused. For Next.js API routes (serverless functions),
    // managing PrismaClient instance lifetime is important. 
    // A global instance is often recommended: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#prismaclient-in-long-running-applications
    // For simplicity here, disconnecting, but consider a shared instance for better performance.
    await prisma.$disconnect();
  }
} 