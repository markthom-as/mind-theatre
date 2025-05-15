import OpenAI from 'openai';
import {
  LLM_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_EMBEDDING_MODEL,
  OLLAMA_API_BASE,
  OLLAMA_EMBEDDING_MODEL,
  OPENAI_AGENT_MODEL,
  OLLAMA_AGENT_MODEL
} from './config'; // Import necessary configs

interface MessageObject {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY, // Use imported config
});

export async function callOpenAI(
  messages: MessageObject[], 
  model: string = OPENAI_AGENT_MODEL // Use configured default
): Promise<string | null> {
  if (!OPENAI_API_KEY) {
    console.error('OpenAI API key not configured.');
    return null;
  }
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: messages as any, // Cast to any if OpenAI.Chat.Completions.ChatCompletionMessageParam[] is too strict initially
    });
    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Error calling OpenAI:', error);
    return null;
  }
}

export async function callOllama(
  messages: MessageObject[], 
  model: string = OLLAMA_AGENT_MODEL // Use configured default
): Promise<string | null> {
  // Ollama /api/generate typically takes a single prompt string.
  // For /api/chat (which expects messages), the structure is slightly different.
  // We'll format the messages into a single string for /api/generate for now.
  // Or, you could switch to /api/chat if your Ollama version supports it well.
  const promptString = messages.map(m => `${m.role}: ${m.content}`).join('\n');

  try {
    const response = await fetch(`${OLLAMA_API_BASE}/api/generate`, { // Or /api/chat if using messages directly
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        model, 
        prompt: promptString, // For /api/generate
        // messages: messages, // For /api/chat (if switching endpoint)
        stream: false 
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Ollama LLM call failed:', response.status, errorBody);
      throw new Error(`Ollama LLM call failed: ${response.status} ${errorBody}`);
    }
    const data = await response.json();
    // For /api/generate, response is in data.response
    // For /api/chat, it's data.message.content
    return data.response || (data.message && data.message.content) || null;
  } catch (error) {
    console.error('Error calling Ollama:', error);
    return null;
  }
}

// --- Embedding Functions ---

export async function createOpenAIEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) {
    console.error('OpenAI API key not configured for embeddings.');
    return null;
  }
  try {
    const response = await openai.embeddings.create({
      model: OPENAI_EMBEDDING_MODEL,
      input: text.replace(/\n/g, ' '), // OpenAI recommends replacing newlines
    });
    return response.data[0]?.embedding || null;
  } catch (error) {
    console.error('Error creating OpenAI embedding:', error);
    return null;
  }
}

export async function createOllamaEmbedding(text: string): Promise<number[] | null> {
  try {
    const response = await fetch(`${OLLAMA_API_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_EMBEDDING_MODEL, prompt: text }),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Ollama embedding call failed:', response.status, errorBody);
      throw new Error(`Ollama embedding call failed: ${response.status} ${errorBody}`);
    }
    const data = await response.json();
    return data.embedding || null;
  } catch (error) {
    console.error('Error creating Ollama embedding:', error);
    return null;
  }
}

export async function createEmbedding(text: string): Promise<number[] | null> {
  if (LLM_PROVIDER === 'ollama') {
    return createOllamaEmbedding(text);
  } else { // Default to openai
    return createOpenAIEmbedding(text);
  }
} 