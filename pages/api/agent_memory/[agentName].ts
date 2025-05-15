import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma'; // Adjusted path
import { Memory } from '@prisma/client';

// Define what a "memory" item for the API response should look like,
// excluding potentially large fields like embeddings if not needed by client.
// Based on Python: text, timestamp, valence, arousal, user_prompt
// We can select these specifically in the Prisma query.
interface AgentMemoryResponseItem {
  text: string;
  timestamp: Date;
  valence: number | null;
  arousal: number | null;
  userPrompt: string | null;
  recallCount: number | null;
  // Optionally add other fields if the client might need them:
  // agentName: string;
  // createdAt: Date;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AgentMemoryResponseItem[] | { error: string; details?: string }>
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { agentName, sortBy, sortOrder } = req.query;

  if (!agentName || typeof agentName !== 'string') {
    return res.status(400).json({ error: 'Agent name is required and must be a string.' });
  }

  // Validate sortBy and sortOrder
  const validSortFields = ['timestamp', 'recallCount'];
  const validSortOrders = ['asc', 'desc'];

  const orderByField = typeof sortBy === 'string' && validSortFields.includes(sortBy) ? sortBy : 'timestamp';
  const orderByDirection = typeof sortOrder === 'string' && validSortOrders.includes(sortOrder) ? sortOrder : 'desc';

  // Construct the orderBy object for Prisma
  let orderByObject: any;
  if (orderByField === 'recallCount') {
    orderByObject = { recallCount: orderByDirection };
  } else {
    orderByObject = { timestamp: orderByDirection }; // Default to timestamp
  }
  // Handle nulls in recallCount by sorting them last when ascending, first when descending if desired.
  // For simplicity, Prisma default null handling is often sufficient (typically sorts nulls first).
  // If specific null sorting is needed (e.g., nulls last for recallCount asc):
  if (orderByField === 'recallCount') {
    orderByObject = { recallCount: { sort: orderByDirection, nulls: 'last' } };
  }

  try {
    const memories = await prisma.memory.findMany({
      where: {
        agentName: agentName,
      },
      orderBy: orderByObject,
      select: { 
        text: true,
        timestamp: true,
        valence: true,
        arousal: true,
        userPrompt: true,
        recallCount: true,
      }
    });

    // findMany returns an empty array if no records are found for that agent.
    // This is the correct behavior, so no special 404 needed for an empty list.
    res.status(200).json(memories);
  } catch (error) {
    console.error(`Error fetching memories for agent ${agentName}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error fetching agent memories.';
    res.status(500).json({ error: 'Failed to fetch agent memories.', details: errorMessage });
  }
} 