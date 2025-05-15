import { Prisma } from '../node_modules/.prisma/client';
import { Memory } from '../node_modules/.prisma/client';
import {
  EFFECTIVE_EMBEDDING_DIM,
  AgentConfig,
  LITELLM_API_BASE,
  OLLAMA_AGENT_MODEL,
  OPENAI_AGENT_MODEL,
  LLM_PROVIDER,
  HIST_MAX_PAIRS
} from './config'; 
import prisma from './prisma';
import { callOllama, callOpenAI, createEmbedding } from './llm'; 

/**
 * Retrieves episodic memories using vector similarity search with pgvector.
 * @param agentName The name of the agent whose memories to search.
 * @param queryVector The embedding vector to search for.
 * @param k The number of memories to retrieve.
 * @returns A promise that resolves to an array of Memory objects or an empty array.
 */
export async function retrieveEpisodicMemories(
  agentName: string,
  queryVector: number[],
  k: number = 3
): Promise<Memory[]> {
  if (!prisma) {
    console.error('Prisma client not initialized in agent_logic.ts. Call setPrismaInstance.');
    return [];
  }

  if (queryVector.length !== EFFECTIVE_EMBEDDING_DIM) {
    console.error(
      `Query vector dimension (${queryVector.length}) does not match effective dimension (${EFFECTIVE_EMBEDDING_DIM}).`
    );
    return [];
  }

  // pgvector expects vectors in the format '[1,2,3]'
  const vectorString = `[${queryVector.join(',')}]`;

  // Using cosine distance (<->) for similarity. Adjust operator if using L2 or inner product.
  // Ensure your "Memory" table and "embedding" column names match your schema.prisma.
  // The table name in SQL is usually the pluralized model name if not specified otherwise.
  // Prisma model "Memory" -> SQL table "Memory" (if @map not used) or often "Memories"
  // Let's assume Prisma maps "Memory" model to "Memory" table.
  // If it maps to "Memories", change "Memory" to "Memories" in the query.
  const query = Prisma.sql`
    SELECT *
    FROM "Memory"
    WHERE "agentName" = ${agentName}
    ORDER BY embedding <-> ${vectorString}::vector
    LIMIT ${k};
  `;

  try {
    const result = await prisma.$queryRaw<Memory[]>(query);
    return result;
  } catch (error) {
    console.error('Error retrieving episodic memories with pgvector:', error);
    return [];
  }
}

/**
 * Scores valence ([-1,1]) and arousal ([0,1]) for a given text using an LLM.
 * @param text The text to score.
 * @returns A promise that resolves to an object with valence and arousal, or null on error.
 */
export async function scoreValenceArousal(
  text: string
): Promise<{ valence: number; arousal: number } | null> {
  const promptContent = (
    `You are an emotion rater. Given the following text, rate its emotional valence and arousal. ` +
    `Valence should be a float from -1 (very negative) to 1 (very positive), 0 is neutral. ` +
    `Arousal should be a float from 0 (very calm) to 1 (very excited/activated). ` +
    'Reply ONLY with a JSON object in the format: {"valence": <float>, "arousal": <float>}\n\n' +
    `Text: ${text}\n` +
    `JSON:`
  );

  const messages: MessageObject[] = [{ role: 'user', content: promptContent }];

  try {
    // Determine which LLM to use (could be a specific model for this task or default agent model)
    // Using EFFECTIVE_AGENT_MODEL from config for this task as an example.
    let llmResponseContent: string | null;
    if (LLM_PROVIDER === 'ollama') {
      // Ensure you have a model string for callOllama, not the `ollama/` prefixed one for litellm
      llmResponseContent = await callOllama(messages, OLLAMA_AGENT_MODEL);
    } else {
      llmResponseContent = await callOpenAI(messages, OPENAI_AGENT_MODEL);
    }

    if (!llmResponseContent) {
      console.error('LLM returned empty content for valence/arousal scoring.');
      return null;
    }

    // Try to extract JSON from the response
    let jsonString = llmResponseContent;
    const jsonStart = llmResponseContent.indexOf('{');
    const jsonEnd = llmResponseContent.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      jsonString = llmResponseContent.substring(jsonStart, jsonEnd + 1);
    }
    
    const data = JSON.parse(jsonString);
    const valence = parseFloat(data.valence);
    const arousal = parseFloat(data.arousal);

    if (isNaN(valence) || isNaN(arousal)) {
      console.error('Failed to parse valid valence/arousal floats from LLM response:', jsonString);
      return null;
    }
    return { valence, arousal };

  } catch (error) {
    console.error('Error scoring valence/arousal with LLM:', error);
    return null;
  }
}

interface MessageObject {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AgentOutput {
  reply: string;
  workingMemory: MessageObject[];
  valence: number | null;
  arousal: number | null;
  color: string;
}

/**
 * Runs the logic for a single agent turn.
 */
export async function runSingleAgent(
  agent: AgentConfig,
  userInput: string,
  workingMemoryInput: ReadonlyArray<MessageObject>,
): Promise<AgentOutput> {
  let currentWorkingMemory = [...workingMemoryInput];

  // 1. Prepare context for memory retrieval
  const memoryQueryContextParts: string[] = [userInput];
  currentWorkingMemory.slice(-HIST_MAX_PAIRS * 2).forEach(msg => memoryQueryContextParts.push(`${msg.role}: ${msg.content}`));
  const memoryQueryContext = memoryQueryContextParts.join(' \n');

  // 2. Create embedding for memory query
  const queryVector = await createEmbedding(memoryQueryContext);

  // 3. Retrieve episodic memories
  let retrievedMemories: Memory[] = [];
  if (queryVector) {
    retrievedMemories = await retrieveEpisodicMemories(agent.name, queryVector, 3);
  }

  // 4. Construct LLM messages array
  const messagesForLLM: MessageObject[] = [{ role: 'system', content: agent.prompt }];
  if (retrievedMemories.length > 0) {
    let episodesText = `\nHere are some of your (${agent.name}'s) past relevant experiences/thoughts (episodic memories):\n`;
    retrievedMemories.forEach(mem => {
      if (mem.text) {
        episodesText += `- ${mem.text}\n`;
      }
    });
    messagesForLLM.push({ role: 'system', content: episodesText.trim() });
  }
  currentWorkingMemory.forEach(msg => messagesForLLM.push(msg));
  messagesForLLM.push({ role: 'user', content: userInput });

  // 5. Call the LLM
  let agentReplyContent: string | null = 'Error: LLM call failed or returned empty.';
  try {
    const modelToUse = LLM_PROVIDER === 'ollama' 
      ? agent.llm_params?.model || OLLAMA_AGENT_MODEL
      : agent.llm_params?.model || OPENAI_AGENT_MODEL;
    
    // Call LLM with the message array directly
    if (LLM_PROVIDER === 'ollama') {
      agentReplyContent = await callOllama(messagesForLLM, modelToUse);
    } else {
      agentReplyContent = await callOpenAI(messagesForLLM, modelToUse);
    }

    if (agentReplyContent === null) agentReplyContent = 'Error: LLM returned null.';

  } catch (error) {
    console.error(`Error calling LLM for agent ${agent.name}:`, error);
    agentReplyContent = `Error processing LLM for ${agent.name}.`;
  }
  const agentReply = agentReplyContent; // Ensure agentReply is always a string

  // 6. Score valence and arousal
  const vaScores = await scoreValenceArousal(agentReply);

  // 7. Update working memory
  currentWorkingMemory.push({ role: 'user', content: userInput });
  currentWorkingMemory.push({ role: 'assistant', content: agentReply });
  while (currentWorkingMemory.length > HIST_MAX_PAIRS * 2) {
    currentWorkingMemory.shift(); 
  }

  return {
    reply: agentReply,
    workingMemory: currentWorkingMemory,
    valence: vaScores ? vaScores.valence : null,
    arousal: vaScores ? vaScores.arousal : null,
    color: agent.color || 'grey',
  };
}

/**
 * Heuristic to decide if a memory should be written.
 */
export function shouldWriteMemory(agentName: string, text: string): boolean {
  const lowerText = text.trim().toLowerCase();
  if (!lowerText || lowerText === "none" || lowerText.startsWith("error:") || lowerText.split(/\s+/).length < 5) {
    return false;
  }
  // Avoid writing memories for certain agents if their output is trivial or just passing through
  const excludedAgents = ["User", "System", "Merger", "Router"]; // Add other agents as needed
  if (excludedAgents.includes(agentName)) {
    return false;
  }
  return true;
}

/**
 * Adds an episodic memory to the database.
 */
export async function addEpisodicMemory(
  agentName: string,
  text: string,
  valence: number | null,
  arousal: number | null,
  userPrompt: string | null // The user prompt that led to this memory
): Promise<Memory | null> {
  if (!prisma) {
    console.error('Prisma client not initialized in agent_logic.ts for addEpisodicMemory.');
    return null;
  }

  const embeddingVector = await createEmbedding(text);
  if (!embeddingVector) {
    console.error(`Failed to create embedding for memory: ${text}`);
    return null;
  }

  // For pgvector with Unsupported type, Prisma expects the vector as a string
  const embeddingString = `[${embeddingVector.join(',')}]`;

  try {
    const newMemory = await prisma.memory.create({
      data: {
        agentName,
        text,
        timestamp: new Date(),
        valence,
        arousal,
        userPrompt,
        ...(embeddingString && { embedding: embeddingString }),
      } as Prisma.MemoryUncheckedCreateInput,
    });
    return newMemory;
  } catch (error) {
    console.error('Error adding episodic memory:', error);
    if (error instanceof Error) {
        if (error.message && error.message.includes("vector")) {
            console.error("A problematic vector string was encountered during memory creation but will not be logged.");
        }
    } else {
        console.error("An unknown error occurred while adding episodic memory");
    }
    return null;
  }
}

// TODO: Add other agent logic functions here (runSingleAgent, etc.) 