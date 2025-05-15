import OpenAI from 'openai';
import { AgentConfig, PromptsConfig } from './loadPrompts';
import { agentDefs } from '../lib/psyche';

// Initialize OpenAI client
// Ensure OPENAI_API_KEY is set in your .env file
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const defaultModel = "gpt-3.5-turbo"; // or your preferred default
export const embeddingModel = "text-embedding-ada-002";
export const embeddingDimension = 1536;

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string; // Optional: for identifying speakers in multi-speaker turns if needed
  systemPrompt?: string;
}

/**
 * Gets a reply from an LLM given a full message history and parameters.
 * @param messages The array of message objects.
 * @param model The LLM model to use.
 * @param temperature The temperature for generation.
 * @param maxTokens The maximum tokens for the response.
 * @returns A promise that resolves to the LLM's reply string.
 */
export async function getLLMResponse(
  messages: LLMMessage[],
  model: string,
  temperature?: number, // Made optional, will use OpenAI default if not provided
  maxTokens?: number   // Made optional
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages as any, // Adjust type if OpenAI SDK has stricter message types
      temperature: temperature,
      max_tokens: maxTokens,
    });
    return completion.choices[0]?.message?.content?.trim() || 'No reply from LLM.';
  } catch (error) {
    console.error(`Error getting LLM response for model ${model}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown LLM error.';
    // Consider how to propagate this error more gracefully or make it more specific
    return `Error processing LLM request: ${errorMessage}`; 
  }
}

/**
 * Gets a reply from an LLM for a given agent, user input, and optional history.
 * @param agent The agent's configuration.
 * @param userInput The user's input message.
 * @param history Optional array of historical messages for context.
 * @returns A promise that resolves to the agent's reply string.
 */
export async function getAgentLLMReply(
  agent: AgentConfig,
  userInput: string,
  history: LLMMessage[] = [] // Default to empty history
): Promise<string> {
  const messagesForLLM: LLMMessage[] = [
    { role: 'system', content: agent.prompt },
    ...history, // Add historical messages
    { role: 'user', content: userInput },
  ];

  const llmParams = agent.llm_params || {};
  const model = llmParams.model || process.env.DEFAULT_AGENT_MODEL || 'gpt-3.5-turbo';
  // Ensure types are correct for parseFloat/parseInt if these come from YAML as strings
  const temp = llmParams.temperature !== undefined ? (typeof llmParams.temperature === 'string' ? parseFloat(llmParams.temperature) : llmParams.temperature as number) : undefined;
  const maxTok = llmParams.max_tokens !== undefined ? (typeof llmParams.max_tokens === 'string' ? parseInt(llmParams.max_tokens, 10) : llmParams.max_tokens as number) : undefined;


  return getLLMResponse(messagesForLLM, model, temp, maxTok);
}

// Helper function to check if the synthesiser output is sufficiently integrated
function isSynthesizedEnough(text: string, agentNames: string[]): boolean {
  if (!text) return false;

  const bulletPoints = (text.match(/^[-*] /gm) || []).length;
  const numberedPoints = (text.match(/^\d+\. /gm) || []).length;
  
  let mentionedAgentCount = 0;
  agentNames.forEach(name => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape special regex chars in agent name
    const regex = new RegExp('\\b' + escapedName + '\\b', 'gi'); // Safer regex construction
    if ((text.match(regex) || []).length > 0) {
      mentionedAgentCount++;
    }
  });

  return bulletPoints <= 1 && numberedPoints <= 0 && mentionedAgentCount <= 1;
}

/**
 * Gets a synthesised response from the Psyche LLM, with recursive refinement.
 * @param userDialogues - A string containing the user\'s input.
 * @param agentDialogues - A string containing all agent dialogues for the current turn.
 * @param promptsConfig - The loaded prompts configuration containing the synthesiser prompt and params.
 * @param currentReflection - Optional: The current reflection from a previous synthesis attempt (used in recursion).
 * @param recursionDepth - Current depth of recursion.
 * @returns A promise that resolves to the Psyche\'s synthesised reply.
 */
export async function getSynthesiserLLMReply(
    userDialogues: string, 
    agentDialogues: string,
    promptsConfig: PromptsConfig,
    currentReflection?: string, // Used for recursive calls
    recursionDepth: number = 0
): Promise<string> {
    const MAX_RECURSION_DEPTH = 2;

    let contextForLLM: string;
    if (currentReflection) {
        // Triple-backticks for multi-line strings to avoid issues with internal quotes/backticks.
        contextForLLM = `The user originally said: "${userDialogues}"
My previous attempt to synthesize the internal dialogue was: "${currentReflection}"
This wasn't quite right. I need to integrate this better into a single, coherent, synthesized perspective, speaking as the unified "I" of the Psyche. I should express the emergent understanding, feeling, or position that arises from the internal dialogue and my prior reflection. Avoid listing or summarizing parts. If I feel pulled in different directions, I should express that tension as a single voice.`;
    } else {
        contextForLLM = `The user said: "${userDialogues}"
Here is the internal dialogue from different parts of the psyche, merged together:
${agentDialogues}
Your task is to integrate these voices into a single, coherent, synthesized perspective. Do NOT list or summarize the parts. Instead, speak as the unified psyche, expressing the emergent understanding, feeling, or position that arises from this internal dialogue. If you feel pulled in different directions, express the tension as a single voice. Do not enumerate or label the parts.`;
    }

    const messagesForLLM: LLMMessage[] = [
        { role: 'system', content: promptsConfig.synthesiser_prompt },
        { role: 'user', content: contextForLLM } 
    ];

    const llmParams = promptsConfig.llm_params || {};
    const model = llmParams.model || process.env.DEFAULT_SYNTH_MODEL || 'gpt-4';
    const temp = llmParams.temperature !== undefined ? (typeof llmParams.temperature === 'string' ? parseFloat(llmParams.temperature) : llmParams.temperature as number) : undefined;
    const maxTok = llmParams.max_tokens !== undefined ? (typeof llmParams.max_tokens === 'string' ? parseInt(llmParams.max_tokens, 10) : llmParams.max_tokens as number) : undefined;
    
    const synthesiserResponse = await getLLMResponse(messagesForLLM, model, temp, maxTok);

    if (recursionDepth < MAX_RECURSION_DEPTH) {
        // Explicitly type 'ad' using the structure of elements in agentDefs
        const agentNames = agentDefs.map((ad: { name: string; prompt: string }) => ad.name);
        if (!isSynthesizedEnough(synthesiserResponse, agentNames)) {
            console.log(`[Synthesiser] Output not fully synthesized (depth ${recursionDepth}), recursing...`);
            return getSynthesiserLLMReply(userDialogues, "", promptsConfig, synthesiserResponse, recursionDepth + 1);
        }
    } else if (recursionDepth >= MAX_RECURSION_DEPTH) {
        console.log(`[Synthesiser] Max recursion depth (${MAX_RECURSION_DEPTH}) reached. Returning current synthesis.`);
    }

    return synthesiserResponse;
}

export async function create_embedding(text: string): Promise<number[]> {
  if (!text || text.trim() === "") {
    console.warn("Attempted to create embedding for empty or whitespace-only text.");
    // Return a zero vector or handle as an error, depending on desired behavior
    return Array(embeddingDimension).fill(0);
  }
  try {
    const response = await openai.embeddings.create({
      model: embeddingModel,
      input: text.replace(/\n/g, ' '), // API recommendation: replace newlines with spaces
    });
    if (response.data && response.data.length > 0 && response.data[0].embedding) {
      return response.data[0].embedding;
    } else {
      throw new Error("No embedding data received from OpenAI API.");
    }
  } catch (error) {
    console.error("Error creating embedding:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

export interface ValenceArousalScore {
  valence: number;
  arousal: number;
}

export async function score_valence_arousal(text: string): Promise<ValenceArousalScore> {
  const systemPrompt = `You are an expert in analyzing text for emotional content. Score the following text on two dimensions: Valence (how positive or negative the emotion is) and Arousal (how calming or exciting the emotion is). Provide scores from -1.0 to 1.0 for both. Output ONLY a JSON object with keys "valence" and "arousal". For example: {"valence": 0.5, "arousal": -0.2}`;

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: text },
  ];

  try {
    // Using the defaultModel, but a smaller/faster model could be considered if available and sufficient
    const llmResponse = await getOpenAIChatCompletion(messages, defaultModel, 0.5, 50); 

    // Attempt to parse the JSON response
    const scores = JSON.parse(llmResponse);
    if (typeof scores.valence === 'number' && typeof scores.arousal === 'number') {
      // Clamp scores to the range [-1, 1] just in case LLM doesn't strictly adhere
      const valence = Math.max(-1, Math.min(1, scores.valence));
      const arousal = Math.max(-1, Math.min(1, scores.arousal));
      return { valence, arousal };
    } else {
      console.error("LLM response for valence/arousal was not in the expected JSON format:", llmResponse);
      // Return neutral scores as a fallback
      return { valence: 0.0, arousal: 0.0 };
    }
  } catch (error) {
    console.error("Error scoring valence and arousal:", error);
    // Return neutral scores in case of any error (parsing, API call, etc.)
    return { valence: 0.0, arousal: 0.0 };
  }
}

export async function getOpenAIChatCompletion(
  messages: LLMMessage[],
  model: string,
  temperature?: number, // Made optional, will use OpenAI default if not provided
  maxTokens?: number   // Made optional
): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages as any, // Adjust type if OpenAI SDK has stricter message types
      temperature: temperature,
      max_tokens: maxTokens,
    });
    return completion.choices[0]?.message?.content?.trim() || 'No reply from LLM.';
  } catch (error) {
    console.error(`Error getting LLM response for model ${model}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown LLM error.';
    // Consider how to propagate this error more gracefully or make it more specific
    return `Error processing LLM request: ${errorMessage}`; 
  }
} 