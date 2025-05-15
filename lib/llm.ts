import { Configuration, OpenAIApi } from 'openai';
// For Ollama, use the 'ollama' npm package if available, otherwise use fetch

const openai = new OpenAIApi(
  new Configuration({ apiKey: process.env.OPENAI_API_KEY })
);

export async function callOpenAI(prompt: string, model = 'gpt-3.5-turbo') {
  const response = await openai.createChatCompletion({
    model,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.data.choices[0]?.message?.content || '';
}

// Ollama wrapper (using fetch for generality)
export async function callOllama(prompt: string, model = 'llama2') {
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const res = await fetch(`${ollamaUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt }),
  });
  if (!res.ok) throw new Error('Ollama LLM call failed');
  const data = await res.json();
  return data.response || '';
} 