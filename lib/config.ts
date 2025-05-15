import dotenv from 'dotenv';
dotenv.config(); // Load .env file

export interface AgentConfig {
  name: string;
  prompt: string;
  llm_params?: Record<string, any>; // e.g., { temperature: 0.7, max_tokens: 150 }
  color?: string; // Added for UI consistency
}

// Example Agent Definitions (replace with your actual agent configs)
// This could be loaded from a JSON/YAML file in a real setup
export const AGENTS_CONFIG: AgentConfig[] = [
  {
    name: "Id",
    prompt: "You are the Id. Respond with primal urges and immediate desires. Be demanding and emotional.",
    llm_params: { temperature: 0.8, max_tokens: 100 },
    color: "red",
  },
  {
    name: "Ego",
    prompt: "You are the Ego. Mediate between the Id and Superego. Be rational, pragmatic, and reality-oriented.",
    llm_params: { temperature: 0.5, max_tokens: 150 },
    color: "green",
  },
  {
    name: "Superego",
    prompt: "You are the Superego. Represent the internalized ideals and moral conscience. Be judgmental and strive for perfection.",
    llm_params: { temperature: 0.6, max_tokens: 120 },
    color: "blue", // Example color
  },
  // ... add all your other agents here
];

export const AGENT_COLORS: Record<string, string> = AGENTS_CONFIG.reduce((acc, agent) => {
  if (agent.color) acc[agent.name] = agent.color;
  return acc;
}, {} as Record<string, string>);

// LLM Provider Configuration
export const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase();

// OpenAI Settings
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
export const OPENAI_AGENT_MODEL = process.env.OPENAI_AGENT_MODEL || "gpt-3.5-turbo";
export const OPENAI_SYNTH_MODEL = process.env.OPENAI_SYNTH_MODEL || "gpt-4o-mini";
export const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-ada-002";
export const OPENAI_EMBEDDING_DIM = parseInt(process.env.OPENAI_EMBEDDING_DIM || "1536");

// Ollama Settings
export const OLLAMA_API_BASE = process.env.OLLAMA_API_BASE || "http://localhost:11434";
export const OLLAMA_AGENT_MODEL = process.env.OLLAMA_AGENT_MODEL || "llama3:latest";
export const OLLAMA_SYNTH_MODEL = process.env.OLLAMA_SYNTH_MODEL || "llama3:latest";
export const OLLAMA_EMBEDDING_MODEL = process.env.OLLAMA_EMBEDDING_MODEL || "nomic-embed-text:latest";
export const OLLAMA_EMBEDDING_DIM = parseInt(process.env.OLLAMA_EMBEDDING_DIM || "768");

// Effective Configuration based on Provider
export let EFFECTIVE_AGENT_MODEL: string;
export let EFFECTIVE_SYNTH_MODEL: string;
export let EFFECTIVE_EMBEDDING_MODEL: string;
export let EFFECTIVE_EMBEDDING_DIM: number;
export let LITELLM_API_BASE: string | undefined = undefined; // Equivalent for Ollama API base

if (LLM_PROVIDER === 'ollama') {
  EFFECTIVE_AGENT_MODEL = `ollama/${OLLAMA_AGENT_MODEL}`;
  EFFECTIVE_SYNTH_MODEL = `ollama/${OLLAMA_SYNTH_MODEL}`;
  EFFECTIVE_EMBEDDING_MODEL = `ollama/${OLLAMA_EMBEDDING_MODEL}`;
  EFFECTIVE_EMBEDDING_DIM = OLLAMA_EMBEDDING_DIM;
  LITELLM_API_BASE = OLLAMA_API_BASE;
} else { // Default to openai
  EFFECTIVE_AGENT_MODEL = OPENAI_AGENT_MODEL;
  EFFECTIVE_SYNTH_MODEL = OPENAI_SYNTH_MODEL;
  EFFECTIVE_EMBEDDING_MODEL = OPENAI_EMBEDDING_MODEL;
  EFFECTIVE_EMBEDDING_DIM = OPENAI_EMBEDDING_DIM;
}

export const HIST_MAX_PAIRS = parseInt(process.env.HIST_MAX_PAIRS || "3");

// Ensure your pgvector embedding dimension in schema.prisma matches EFFECTIVE_EMBEDDING_DIM
// e.g., Unsupported("vector(" + EFFECTIVE_EMBEDDING_DIM + ")")

console.log(`[Config] Effective Embedding Dimension: ${EFFECTIVE_EMBEDDING_DIM}`);
console.log(`[Config] Effective Embedding Model: ${EFFECTIVE_EMBEDDING_MODEL}`);
console.log(`[Config] Effective Agent Model: ${EFFECTIVE_AGENT_MODEL}`); 