import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../../lib/prisma';
import { getAgents, AgentConfig, getPromptsConfig, PromptsConfig } from '../../../../lib/loadPrompts';
import { getAgentLLMReply, getSynthesiserLLMReply, create_embedding, LLMMessage, score_valence_arousal } from '../../../../lib/llmUtils';
import { Message, Memory } from '../../../../node_modules/.prisma/client';
import { add_episodic_memory, should_write_memory, retrieve_relevant_memories } from "../../../../lib/memoryUtils";

interface AgentDialogueEntry {
  name: string;
  reply: string;
  color: string;
  valence: number | null;
  arousal: number | null;
}

interface ChatTurnResponse {
  user_message: Message; // The user message that was just processed
  agent_dialogue: AgentDialogueEntry[];
  psyche_response: Message; // The psyche message generated for this turn
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatTurnResponse | { error: string; details?: string }>
) {
  const { chatId } = req.query;

  if (typeof chatId !== 'string') {
    return res.status(400).json({ error: 'Chat ID is required and must be a string.' });
  }

  if (req.method === 'POST') {
    const { message: userInput, userId = 'user' } = req.body; // Default userId to 'user' for now

    if (!userInput || typeof userInput !== 'string') {
      return res.status(400).json({ error: 'User input "message" is required.' });
    }

    try {
      const chatSession = await prisma.chat.findUnique({ where: { id: chatId } });
      if (!chatSession) {
        return res.status(404).json({ error: `Chat session ${chatId} not found.` });
      }

      const userMessageRecord = await prisma.message.create({
        data: {
          chatId: chatId,
          sender: userId, 
          text: userInput,
          type: 'user',
        },
      });

      const agents: AgentConfig[] = getAgents();
      const agentDialoguesOutput: AgentDialogueEntry[] = [];
      
      // Prepare for synthesiser: user input + all agent replies this turn
      // This will be a simple concatenation for now.
      let formattedDialoguesForSynthesiser = `User: ${userInput}\n\nInner Dialogue:\n`;

      for (const agent of agents) {
        // Fetch interleaved user messages and this agent's previous replies
        const rawHistory = await prisma.message.findMany({
          where: {
            chatId: chatId,
            OR: [
              { type: 'user' }, // All user messages in the chat
              { type: 'agent', agentId: agent.name } // This agent's messages
            ]
          },
          orderBy: { timestamp: 'asc' },
          take: 10, // Take more messages to form a better conversational context
        });

        const agentTurnHistory: LLMMessage[] = rawHistory.map((msg: Message) => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.text,
          name: msg.type === 'user' ? undefined : msg.sender, // Agent's name for assistant messages
        }));
        
        // 1. Retrieve relevant episodic memories for the agent based on current user input
        let retrievedMemories: Memory[] = [];
        try {
          retrievedMemories = await retrieve_relevant_memories(agent.name, userInput, 3);
        } catch (retrievalError) {
          console.error(`Error retrieving memories for agent ${agent.name}:`, retrievalError);
        }

        // Prepare messages for LLM: System prompt will be added by getAgentLLMReply
        let messagesForAgentLLM: LLMMessage[] = [];

        if (retrievedMemories.length > 0) {
          const memoryContext = retrievedMemories
            .map(mem => `Recalled memory: ${mem.text} (In response to: ${mem.userPrompt || 'prior context'})`)
            .join("\n");
          // Add memories as a system message after the main system prompt (which is added in getAgentLLMReply)
          // but before the turn history.
          messagesForAgentLLM.push({ role: "system", content: `[Prior relevant thoughts for ${agent.name}]:\n${memoryContext}` });
        }
        
        messagesForAgentLLM = messagesForAgentLLM.concat(agentTurnHistory);
        
        // Current user input is passed separately to getAgentLLMReply and handled there.
        const agentReplyText = await getAgentLLMReply(agent, userInput, messagesForAgentLLM);

        // Score valence and arousal for the agent's reply (moved up to be used for both output and memory)
        let emotionScores: { valence: number; arousal: number } | null = null;
        try {
          emotionScores = await score_valence_arousal(agentReplyText);
        } catch (vaError) {
          console.error(`Error scoring valence/arousal for agent ${agent.name}'s reply: "${agentReplyText.substring(0,50)}..."`, vaError);
          // emotionScores remains null, which is handled below
        }

        // Fetch the agent's DB record to get its ID
        const agentRecord = await prisma.agent.findUnique({
          where: { name: agent.name },
          select: { id: true } // Only select the id
        });

        if (!agentRecord) {
          console.error(`Agent ${agent.name} not found in database. Skipping message save for this agent.`);
          // Add to dialogue output but don't save DB message for this agent or attempt memory writing
           agentDialoguesOutput.push({
             name: agent.name,
             reply: agentReplyText,
             color: agent.color || 'grey',
             valence: emotionScores ? emotionScores.valence : null,
             arousal: emotionScores ? emotionScores.arousal : null,
           });
           formattedDialoguesForSynthesiser += `${agent.name}: ${agentReplyText}\n`;
           continue; 
        }

        await prisma.message.create({
          data: {
            chatId: chatId,
            agentId: agentRecord.id, // USE THE FETCHED ID HERE
            sender: agent.name,
            text: agentReplyText,
            type: 'agent',
          },
        });
        agentDialoguesOutput.push({
          name: agent.name,
          reply: agentReplyText,
          color: agent.color || 'grey',
          valence: emotionScores ? emotionScores.valence : null,
          arousal: emotionScores ? emotionScores.arousal : null,
        });
        formattedDialoguesForSynthesiser += `${agent.name}: ${agentReplyText}\n`;

        // After saving agent replies, check if they should be stored as episodic memories
        if (should_write_memory(agentReplyText) && emotionScores) { // also check if emotionScores are available
          try {
            // 1. Create embedding for the agent's reply
            const embedding = await create_embedding(agentReplyText);

            // 2. Score valence and arousal - ALREADY DONE ABOVE
            // const emotionScores = await score_valence_arousal(agentReplyText); // Removed duplicate call

            // 3. Add to episodic memory with embedding and scores
            console.log(`[Chat API] About to add memory for agent ${agent.name}. UserInput: "${userInput}", AgentReply: "${agentReplyText.substring(0,50)}..."`);
            await add_episodic_memory({
              agentName: agent.name,
              text: agentReplyText,
              userPrompt: userInput,
              embedding: embedding,
              valence: emotionScores.valence, // emotionScores is guaranteed to be non-null here due to the if condition
              arousal: emotionScores.arousal, // emotionScores is guaranteed to be non-null here
            });
          } catch (memoryError) {
            // Log the error but don't let it break the chat flow
            console.error(`Failed to add episodic memory (with embedding, valence/arousal) for agent ${agent.name}:`, memoryError);
          }
        }
      }

      const promptsConfig: PromptsConfig = getPromptsConfig();
      const psycheResponseText = await getSynthesiserLLMReply(formattedDialoguesForSynthesiser, promptsConfig);

      const psycheMessageRecord = await prisma.message.create({
        data: {
          chatId: chatId,
          sender: 'Psyche',
          text: psycheResponseText,
          type: 'psyche',
        },
      });

      res.status(200).json({
        user_message: userMessageRecord,
        agent_dialogue: agentDialoguesOutput,
        psyche_response: psycheMessageRecord,
      });

    } catch (error) {
      console.error(`Error processing chat for Chat ID ${chatId}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error.';
      res.status(500).json({ error: 'Failed to process chat.', details: errorMessage });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
} 