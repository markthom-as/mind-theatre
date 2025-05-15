import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../lib/prisma';
import { getAgents, AgentConfig, getPromptsConfig, PromptsConfig } from '../../../../lib/loadPrompts';
import { getAgentLLMReply, getSynthesiserLLMReply, create_embedding, LLMMessage, score_valence_arousal } from '../../../../lib/llmUtils';
import { Message, Memory } from '../../../../node_modules/.prisma/client';
import { add_episodic_memory, should_write_memory, retrieve_relevant_memories } from "../../../../lib/memoryUtils";
import * as net from 'net';

// Keep AgentDialogueEntry, but it will be streamed one by one
interface AgentDialogueEntry {
  name: string;
  reply: string;
  color: string;
  valence: number | null;
  arousal: number | null;
  // id?: string; // Optional: if we want to send a temporary ID for UI to update placeholders
}

// The overall ChatTurnResponse is no longer applicable for a streaming API
// Individual messages/events will be streamed.

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse // Removed the specific ChatTurnResponse type here as we're streaming
) {
  const { chatId } = req.query;
  const SSE_DELIMITER = "\n\n";
  // console.log(new Date().toISOString(), `[HANDLER START] Chat ID: ${chatId}`);

  if (typeof chatId !== 'string') {
    // For streaming, we'd ideally stream an error event too, but for setup errors, early JSON exit is fine.
    return res.status(400).json({ error: 'Chat ID is required and must be a string.' });
  }

  if (req.method === 'POST') {
    const { message: userInput, userId = 'user' } = req.body;
    // console.log(new Date().toISOString(), `[USER INPUT] ${userInput.substring(0, 50)}...`);

    // Disable Nagle's algorithm
    const socket = res.socket as net.Socket;
    if (socket) {
      socket.setNoDelay(true);
      // console.log(new Date().toISOString(), "[SETNODELAY] Nagle's algorithm disabled for the socket.");
    }

    if (!userInput || typeof userInput !== 'string') {
      return res.status(400).json({ error: 'User input "message" is required.' });
    }

    // --- Start Streaming Setup ---
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Necessary for Vercel/Nginx to prevent buffering
    });
    // console.log(new Date().toISOString(), "[STREAM HEADERS SENT]");
    // --- End Streaming Setup ---

    try {
      const memoryPromises: Promise<void>[] = []; // Array to hold memory processing promises
      // console.log(new Date().toISOString(), "[TRY BLOCK START]");

      const chatSession = await prisma.chat.findUnique({ where: { id: chatId } });
      if (!chatSession) {
        // If basic validation fails, we can't stream, so send JSON error and close.
        // Or, write an error event to the stream if it's already set up.
        // For now, let's assume we'd close before headers if this happened.
        // However, the try/catch is after res.writeHead, so we MUST stream error.
        res.write(`data: ${JSON.stringify({ type: 'error', payload: { message: `Chat session ${chatId} not found.` } })}${SSE_DELIMITER}`);
        res.end();
        return;
      }
      // console.log(new Date().toISOString(), "[CHAT SESSION VALIDATED]");

      // Save and stream the user's message first (optional, but good for UI)
      const userMessageRecord = await prisma.message.create({
        data: { chatId: chatId, sender: userId, text: userInput, type: 'user' },
      });
      // console.log(new Date().toISOString(), "[USER MESSAGE SAVED]");
      res.write(`data: ${JSON.stringify({ type: 'user_message', payload: userMessageRecord })}${SSE_DELIMITER}`);
      // console.log(new Date().toISOString(), "[USER MESSAGE STREAMED]");
      await new Promise(resolve => setTimeout(resolve, 0));
      // console.log(new Date().toISOString(), "[USER MESSAGE YIELD AFTER STREAM]");
      

      const agents: AgentConfig[] = getAgents();
      const agentRepliesForSynthesis: { name: string; reply: string }[] = [];
      // console.log(new Date().toISOString(), `[AGENT PROCESSING START] Found ${agents.length} agents.`);
      
      const agentProcessingPromises = agents.map(async (agent, index) => {
        // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] START PROCESSING`);
        try {
          const rawHistory = await prisma.message.findMany({
            where: { chatId: chatId, OR: [{ type: 'user' }, { type: 'agent', agentId: agent.name }] },
            orderBy: { timestamp: 'asc' }, take: 10,
          });
          const agentTurnHistory: LLMMessage[] = rawHistory.map((msg: Message) => ({
            role: msg.type === 'user' ? 'user' : 'assistant', content: msg.text, name: msg.type === 'user' ? undefined : msg.sender,
          }));
          
          let retrievedMemories: Memory[] = [];
          try {
            // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] Retrieving memories...`);
            retrievedMemories = await retrieve_relevant_memories(agent.name, userInput, 3);
            // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] Retrieved ${retrievedMemories.length} memories.`);
          } catch (retrievalError) {
            console.error(`Error retrieving memories for agent ${agent.name}:`, retrievalError);
            // Optionally stream this specific error for the agent
             res.write(`data: ${JSON.stringify({ type: 'agent_error', payload: { name: agent.name, message: 'Error retrieving memories.' } })}${SSE_DELIMITER}`);
             await new Promise(resolve => setTimeout(resolve, 0));
          }

          let messagesForAgentLLM: LLMMessage[] = [];
          if (retrievedMemories.length > 0) {
            const memoryContext = retrievedMemories
              .map((mem: Memory) => `Recalled memory: ${mem.text} (In response to: ${mem.userPrompt || 'prior context'})`) // mem typed as Memory
              .join("\n");
            messagesForAgentLLM.push({ role: "system", content: `[Prior relevant thoughts for ${agent.name}]:\n${memoryContext}` });
          }
          messagesForAgentLLM = messagesForAgentLLM.concat(agentTurnHistory);
          
          // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] Getting LLM reply...`);
          const agentReplyText = await getAgentLLMReply(agent, userInput, messagesForAgentLLM);
          // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] LLM reply received: ${agentReplyText.substring(0,30)}...`);

          let emotionScores: { valence: number; arousal: number } | null = null;
          try {
            emotionScores = await score_valence_arousal(agentReplyText);
          } catch (vaError) {
            console.error(`Error scoring valence/arousal for agent ${agent.name}:`, vaError);
             res.write(`data: ${JSON.stringify({ type: 'agent_error', payload: { name: agent.name, message: 'Error scoring emotions.' } })}${SSE_DELIMITER}`);
             await new Promise(resolve => setTimeout(resolve, 0));
          }

          const agentRecord = await prisma.agent.findUnique({ where: { name: agent.name }, select: { id: true } });

          if (!agentRecord) {
            console.error(`Agent ${agent.name} not found in database.`);
            // Stream an error for this specific agent
            res.write(`data: ${JSON.stringify({ type: 'agent_error', payload: { name: agent.name, message: 'Agent not found in DB.' } })}${SSE_DELIMITER}`);
            await new Promise(resolve => setTimeout(resolve, 0));
            return null; // Skip further processing for this agent
          }

          const agentDisplayColor = agent.color || 'grey';
          const agentMessageData: Omit<Message, 'id' | 'timestamp' | 'chatId'> & { chatId: string } = {
            chatId: chatId, agentId: agentRecord.id, sender: agent.name, text: agentReplyText, type: 'agent',
            color: agentDisplayColor, valence: emotionScores?.valence ?? null, arousal: emotionScores?.arousal ?? null,
            userPrompt: null,
          };
          
          // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] Saving message to DB...`);
          const savedAgentMessage = await prisma.message.create({ data: agentMessageData as any}); // Prisma will add id, timestamp
          // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] Message saved to DB (ID: ${savedAgentMessage.id})`);

          const agentDialogueEntry: AgentDialogueEntry & { id: string } = { // Add id for client
            id: savedAgentMessage.id, name: agent.name, reply: agentReplyText, color: agentDisplayColor,
            valence: emotionScores?.valence ?? null, arousal: emotionScores?.arousal ?? null,
          };
          // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] Writing to client stream...`);
          res.write(`data: ${JSON.stringify({ type: 'agent_update', payload: agentDialogueEntry })}${SSE_DELIMITER}`);
          // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] Wrote to client stream.`);
          await new Promise(resolve => setTimeout(resolve, 0));
          // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] Yielded after stream write.`);
          
          agentRepliesForSynthesis.push({ name: agent.name, reply: agentReplyText });

          if (should_write_memory(agentReplyText) && emotionScores) {
            const currentAgentName = agent.name; // Capture agent name for async context
            const currentUserInput = userInput; // Capture user input for async context
            const currentEmotionScores = { ...emotionScores }; // Capture scores for async context
            // console.log(new Date().toISOString(), `[AGENT ${index} - ${currentAgentName}] Initiating deferred memory work.`);
            memoryPromises.push(
              create_embedding(agentReplyText)
                .then(embedding => {
                  // console.log(new Date().toISOString(), `[AGENT ${index} - ${currentAgentName}] Embedding created for memory.`);
                  return add_episodic_memory({
                    agentName: currentAgentName,
                    text: agentReplyText,
                    userPrompt: currentUserInput,
                    embedding: embedding,
                    valence: currentEmotionScores.valence,
                    arousal: currentEmotionScores.arousal,
                  });
                })
                .then(() => {
                  // console.log(new Date().toISOString(), `[AGENT ${index} - ${currentAgentName}] Deferred memory work COMPLETE.`);
                })
                .catch(memoryError => {
                  console.error(`Error in deferred episodic memory for agent ${currentAgentName}:`, memoryError);
                  // Not streaming this error to client to keep main flow clean
                })
            );
          }
          // console.log(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] FINISHED main processing.`);
          return agentReplyText; // Indicate success for this agent
        } catch (agentError) {
          console.error(new Date().toISOString(), `[AGENT ${index} - ${agent.name}] ERROR in processing:`, agentError);
          const errorMessage = agentError instanceof Error ? agentError.message : 'Unknown error.';
          res.write(`data: ${JSON.stringify({ type: 'agent_error', payload: { name: agent.name, message: errorMessage } })}${SSE_DELIMITER}`);
          await new Promise(resolve => setTimeout(resolve, 0));
          return null; // Indicate failure for this agent
        }
      });

      // console.log(new Date().toISOString(), "[AGENT LOOOP] Before Promise.allSettled(agentProcessingPromises)");
      await Promise.allSettled(agentProcessingPromises);
      // console.log(new Date().toISOString(), "[AGENT LOOOP] After Promise.allSettled(agentProcessingPromises) - All agent core tasks settled.");

      // Now, proceed with synthesis using successfully collected replies
      const promptsConfig: PromptsConfig = getPromptsConfig();
      // console.log(new Date().toISOString(), "[PSYCHE] Getting LLM reply...");
      const psycheResponseText = await getSynthesiserLLMReply(userInput, 
        agentRepliesForSynthesis.map(ar => `${ar.name}: ${ar.reply}`).join('\n'), // Corrected to single backslash
        promptsConfig
      );
      // console.log(new Date().toISOString(), `[PSYCHE] LLM reply received: ${psycheResponseText.substring(0,30)}...`);

      let psycheEmotionScores: { valence: number; arousal: number } | null = null;
      try {
        psycheEmotionScores = await score_valence_arousal(psycheResponseText);
      } catch (vaError) {
        console.error(`Error scoring valence/arousal for Psyche:`, vaError);
        // Optionally stream this error too
      }

      // console.log(new Date().toISOString(), "[PSYCHE] Saving message to DB...");
      const psycheMessageRecord = await prisma.message.create({
        data: {
          chatId: chatId, sender: 'Psyche', text: psycheResponseText, type: 'psyche',
          valence: psycheEmotionScores?.valence ?? null, arousal: psycheEmotionScores?.arousal ?? null,
        },
      });
      // console.log(new Date().toISOString(), `[PSYCHE] Message saved to DB (ID: ${psycheMessageRecord.id})`);

      // console.log(new Date().toISOString(), "[PSYCHE] Writing to client stream...");
      res.write(`data: ${JSON.stringify({ type: 'psyche_response', payload: psycheMessageRecord })}${SSE_DELIMITER}`);
      // console.log(new Date().toISOString(), "[PSYCHE] Wrote to client stream.");
      await new Promise(resolve => setTimeout(resolve, 0));
      // console.log(new Date().toISOString(), "[PSYCHE] Yielded after stream write.");

      if (should_write_memory(psycheResponseText) && psycheEmotionScores) {
        // console.log(new Date().toISOString(), "[PSYCHE] Initiating deferred memory work.");
        const currentUserInput = userInput; // Capture for async context
        const currentPsycheText = psycheResponseText; // Capture for async context
        const currentPsycheEmotionScores = { ...psycheEmotionScores }; // Capture for async context
        memoryPromises.push(
          create_embedding(currentPsycheText)
            .then(embedding => {
              // console.log(new Date().toISOString(), "[PSYCHE] Embedding created for memory.");
              return add_episodic_memory({
                agentName: 'Psyche',
                text: currentPsycheText,
                userPrompt: currentUserInput,
                embedding: embedding,
                valence: currentPsycheEmotionScores.valence,
                arousal: currentPsycheEmotionScores.arousal,
              });
            })
            .then(() => {
              // console.log(new Date().toISOString(), "[PSYCHE] Deferred memory work COMPLETE.");
            })
            .catch(memoryError => {
              console.error(`Error in deferred episodic memory for Psyche:`, memoryError);
              // Not streaming this error to client
            })
        );
      }
      
      // console.log(new Date().toISOString(), "[MEMORY WAIT] Before Promise.allSettled(memoryPromises)");
      await Promise.allSettled(memoryPromises);
      // console.log(new Date().toISOString(), "[MEMORY WAIT] After Promise.allSettled(memoryPromises) - All memory tasks settled.");

      // console.log(new Date().toISOString(), "[STREAM END] Writing event: done");
      res.write(`event: done\ndata: ${JSON.stringify({ message: "Stream complete" })}${SSE_DELIMITER}`);
      res.end();
      // console.log(new Date().toISOString(), "[STREAM END] Response ended.");

    } catch (error) {
      console.error(new Date().toISOString(), "[GLOBAL ERROR] In handler: ", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error.';
      // If headers not sent, can send JSON. If already streaming, this catch might be too late for a clean JSON error.
      // The res.write for specific errors within the try block is more granular.
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to process chat due to a general error.', details: errorMessage });
      } else {
        // Headers were sent, so we must use the stream to signal a terminal error if possible.
        res.write(`data: ${JSON.stringify({ type: 'error', payload: { message: 'A critical error occurred.', details: errorMessage } })}${SSE_DELIMITER}`);
        await new Promise(resolve => setTimeout(resolve, 0));
        res.write(`event: done\ndata: ${JSON.stringify({ message: "Stream abruptly ended due to error" })}${SSE_DELIMITER}`);
        res.end();
      }
    }
  } else {
    res.setHeader('Allow', ['POST']);
    if (!res.headersSent) { // Check if headers are not sent before setting status and ending
        res.status(405).end(`Method ${req.method} Not Allowed`);
    } else {
        res.end(); // If headers sent, just end the response.
    }
  }
  // console.log(new Date().toISOString(), "[HANDLER END]");
} 