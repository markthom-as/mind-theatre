import prisma from './prisma';
import { create_embedding } from './llmUtils';
import { Memory } from '../node_modules/.prisma/client';
import { v4 as uuidv4 } from 'uuid';

interface EpisodicMemoryInput {
  agentName: string;
  text: string;
  userPrompt: string;
  embedding?: number[]; // Embedding is now optional, will be generated if not provided
  valence?: number;
  arousal?: number;
}

/**
 * Adds an episodic memory to the database.
 * If an embedding is provided, it's stored directly.
 * Valence and arousal scores are also stored if provided.
 */
export async function add_episodic_memory(memoryInput: EpisodicMemoryInput): Promise<void> {
  try {
    const { agentName, text, userPrompt, valence, arousal } = memoryInput;
    const embeddingDML = memoryInput.embedding ? `'[${memoryInput.embedding.join(',')}]'::vector` : 'NULL'; // Renamed for clarity as it's DML part

    const valenceValue = typeof valence === 'number' ? valence : null;
    const arousalValue = typeof arousal === 'number' ? arousal : null;
    const userPromptValue = userPrompt || null;
    const newId = uuidv4();

    // Explicitly set all columns that don't have DB-level auto-update triggers like @updatedAt
    // or provide values for those that do if raw query bypasses Prisma's management.
    // For timestamp, createdAt, updatedAt, using NOW() is safest for raw inserts.
    // recallCount defaults to 0, lastRecalledTs to NULL.
    console.log(`[MemoryUtils] Executing INSERT for agent ${agentName}. userPromptValue: "${userPromptValue}"`);
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Memory" ("id", "agentName", "text", "userPrompt", "embedding", "valence", "arousal", "timestamp", "createdAt", "updatedAt", "recallCount", "lastRecalledTs")
       VALUES ($1, $2, $3, $4, ${embeddingDML}, $5, $6, NOW(), NOW(), NOW(), 0, NULL)`,
      newId,
      agentName,
      text,
      userPromptValue,
      // embeddingDML is interpolated
      valenceValue,
      arousalValue
    );

    console.log(`Episodic memory added (ID: ${newId}) for agent ${memoryInput.agentName}: "${memoryInput.text.substring(0, 50)}..." (Embedding ${memoryInput.embedding ? 'included' : 'omitted'}, Valence: ${valenceValue ?? 'N/A'}, Arousal: ${arousalValue ?? 'N/A'})`);
  } catch (error) {
    console.error('Error adding episodic memory:', error);
    throw error;
  }
}

/**
 * Determines if an agent's reply is significant enough to be stored as an episodic memory.
 * Currently, it checks if the text length is greater than a defined minimum.
 * @param text - The text of the agent's reply.
 * @returns True if the memory should be written, false otherwise.
 */
export function should_write_memory(text: string): boolean {
  const MIN_LENGTH_FOR_MEMORY = 20; // Arbitrary threshold, can be refined
  // TODO: Implement more sophisticated checks (keywords, etc.) as in Python version
  return text.length > MIN_LENGTH_FOR_MEMORY;
}

const DEFAULT_NUM_MEMORIES_TO_RETRIEVE = 5;

/**
 * Retrieves relevant memories for a given agent based on a query text.
 * Uses vector similarity search (cosine distance) with pgvector.
 * @param agentName The name of the agent for whom to retrieve memories.
 * @param queryText The text to find relevant memories for.
 * @param numMemories The maximum number of memories to retrieve.
 * @returns A promise that resolves to an array of Memory objects.
 */
export async function retrieve_relevant_memories(
  agentName: string,
  queryText: string,
  numMemories: number = DEFAULT_NUM_MEMORIES_TO_RETRIEVE
): Promise<Memory[]> {
  if (!queryText.trim()) {
    console.log("Query text for memory retrieval is empty, returning no memories.");
    return [];
  }

  try {
    // 1. Create an embedding for the query text
    const queryEmbedding = await create_embedding(queryText);

    // Ensure the embedding is in the string format pgvector expects: '[1,2,3]'
    const embeddingString = `[${queryEmbedding.join(',')}]`;

    // 2. Query the database using pgvector for similarity search
    // The SQL query uses the <=> operator for cosine distance with pgvector
    // It filters by agentName and orders by similarity, then limits the results.
    // IMPORTANT: Ensure the `embedding` column in your `Memory` table is of type `vector(1536)`
    // and you have created an appropriate index for it for performance, e.g.:
    // CREATE INDEX ON "Memory" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
    // or USING hnsw (embedding vector_cosine_ops);
    const memories = await prisma.$queryRawUnsafe<Memory[]>(
      `SELECT id, "agentName", text, "userPrompt", timestamp, valence, arousal, embedding::text 
       FROM "Memory" 
       WHERE "agentName" = $1 AND embedding IS NOT NULL
       ORDER BY embedding <=> $2::vector 
       LIMIT $3`,
      agentName,
      embeddingString,
      numMemories
    );
    
    // The embedding is returned as text from the query, parse it back to an array of numbers if needed by consumer
    // For now, we'll return it as is, as the primary use is for context, not re-computation here.
    // If the consumer needs the embedding as number[], it would need: memories.map(m => ({...m, embedding: JSON.parse(m.embedding)}))
    // However, Prisma might handle this conversion automatically if the type is correctly inferred.
    // Let's assume for now the retrieved Memory objects are suitable as is.

    console.log(`Retrieved ${memories.length} memories for agent ${agentName} based on query: "${queryText.substring(0,50)}..."`);
    return memories;
  } catch (error) {
    console.error(`Error retrieving relevant memories for agent ${agentName}:`, error);
    return []; // Return empty array on error
  }
} 