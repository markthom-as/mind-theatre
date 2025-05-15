import type { NextApiRequest, NextApiResponse } from 'next';
import { getOrCreateChat } from '../../lib/psyche';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const chat = await getOrCreateChat();
  res.json({ chat_id: chat.id });
} 