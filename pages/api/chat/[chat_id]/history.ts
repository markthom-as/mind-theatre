import type { NextApiRequest, NextApiResponse } from 'next';
import { getMessages } from '../../../../lib/psyche';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { chat_id } = req.query;
  if (!chat_id || typeof chat_id !== 'string') {
    return res.status(400).json({ error: 'Invalid chat_id' });
  }
  const messages = await getMessages(chat_id);
  res.json(messages);
} 