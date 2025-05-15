import type { NextApiRequest, NextApiResponse } from 'next';
import { addMessage, runSynthesis } from '../../../lib/psyche';
import { prisma } from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chat_id } = req.query;
  if (!chat_id || typeof chat_id !== 'string') {
    return res.status(400).json({ error: 'Invalid chat_id' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { message, agent_dialogue } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'No message provided' });
  }
  // Add user message
  await addMessage(chat_id, 'User', message, 'user');
  // Streaming agent replies and synthesis
  if (agent_dialogue) {
    // Persist agent replies
    for (const entry of agent_dialogue) {
      const agent = await prisma.agent.findUnique({ where: { name: entry.name } });
      await addMessage(chat_id, entry.name, entry.reply, 'agent', agent?.id);
    }
    const psyche_response = await runSynthesis(agent_dialogue, message);
    await addMessage(chat_id, 'Psyche', psyche_response, 'psyche');
    return res.json({
      agent_dialogue,
      psyche_response,
    });
  }
  // Fallback: no agent_dialogue provided
  return res.status(400).json({ error: 'Agent replies required for chat session.' });
} 