import type { NextApiRequest, NextApiResponse } from 'next';
import {
  getOrCreateAgents,
  getOrCreateChat,
  addMessage,
  runAgent,
  runSynthesis,
} from '../../lib/psyche';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'No message provided' });
  }

  // Get or create agents
  const agents = await getOrCreateAgents();
  // Create a new chat
  const chat = await getOrCreateChat();
  // Add user message
  await addMessage(chat.id, 'User', message, 'user');

  // Run each agent
  const agentReplies = await Promise.all(
    agents.map(async (agent) => {
      const reply = await runAgent(agent, message, 'openai');
      await addMessage(chat.id, agent.name, reply, 'agent', agent.id);
      return { name: agent.name, reply };
    })
  );

  // Synthesize final response
  const psyche_response = await runSynthesis(agentReplies, message);
  await addMessage(chat.id, 'Psyche', psyche_response, 'psyche');

  // Return agent dialogue and synthesis
  res.json({
    agent_dialogue: agentReplies,
    psyche_response,
    chat_id: chat.id,
  });
} 