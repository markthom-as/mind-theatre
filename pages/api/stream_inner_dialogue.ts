import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgents, AgentConfig } from '../../lib/loadPrompts';
import { getAgentLLMReply, score_valence_arousal } from '../../lib/llmUtils';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { message: userInput } = req.body;

  if (!userInput || typeof userInput !== 'string') {
    return res.status(400).json({ error: 'Invalid user input: "message" is required and must be a string.' });
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // res.flushHeaders(); // Flushing headers explicitly might be handled by Next.js or underlying Node.js

  const agents = getAgents();

  try {
    for (const agent of agents) {
      // It's good practice to check if the response has been closed by the client, 
      // especially for long-running streams or loops.
      // However, NextApiResponse doesn't directly expose a 'closed' or 'writableEnded' property in a straightforward way for this check before writing.
      // Node's http.ServerResponse (which NextApiResponse wraps) has `writableEnded` or `destroyed`.
      // For simplicity in Next.js API routes, we'll proceed, but in a raw Node HTTP server, you'd check req.socket.destroyed.

      const agentReply = await getAgentLLMReply(agent, userInput);
      
      // Score valence and arousal
      let vaScores: { valence: number; arousal: number } | null = null;
      try {
        vaScores = await score_valence_arousal(agentReply);
      } catch (vaError) {
        console.error(`Error scoring valence/arousal for agent ${agent.name} (stream): "${agentReply.substring(0,50)}..."`, vaError);
        // vaScores remains null
      }

      const sseData = {
        name: agent.name,
        reply: agentReply,
        color: agent.color || 'grey', // Ensure color from AgentConfig is used
        valence: vaScores ? vaScores.valence : null, // Added valence
        arousal: vaScores ? vaScores.arousal : null, // Added arousal
      };
      res.write(`data: ${JSON.stringify(sseData)}\n\n`);
    }
  } catch (error) {
    console.error('Error during agent processing stream:', error);
    // If an error occurs after headers are sent, we can't change status code.
    // We can try to send an error event if the stream is still writable.
    if (!res.writableEnded) {
        try {
            res.write(`event: error\ndata: ${JSON.stringify({ message: "Error processing stream" })}\n\n`);
        } catch (writeError) {
            console.error("Failed to write error event to SSE stream:", writeError);
        }
    }
  } finally {
    if (!res.writableEnded) {
      res.write('event: done\ndata: {"message": "Stream complete"}\n\n');
      res.end(); // Ensure the stream is properly closed
    }
  }
} 