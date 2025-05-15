import prisma from './prisma';
import { callOpenAI, callOllama } from './llm';

export async function getOrCreateAgents() {
  // Example agent definitions (fill in prompts as needed)
  const agentDefs = [
    { name: 'Id', prompt: 'You are the Id. Respond with primal urges.' },
    { name: 'Ego', prompt: 'You are the Ego. Respond with rationality.' },
    { name: 'Superego', prompt: 'You are the Superego. Respond with moral judgment.' },
  ];
  // Upsert agents
  const agents = await Promise.all(
    agentDefs.map(async (def) =>
      prisma.agent.upsert({
        where: { name: def.name },
        update: { prompt: def.prompt },
        create: { name: def.name, prompt: def.prompt },
      })
    )
  );
  return agents;
}

export async function getOrCreateChat(chatId?: string) {
  if (chatId) {
    const chat = await prisma.chat.findUnique({ where: { id: chatId } });
    if (chat) return chat;
  }
  return prisma.chat.create({ data: {} });
}

export async function addMessage(chatId: string, sender: string, text: string, type: string, agentId?: string) {
  return prisma.message.create({
    data: {
      chatId,
      sender,
      text,
      type,
      agentId,
    },
  });
}

export async function getMessages(chatId: string) {
  return prisma.message.findMany({
    where: { chatId },
    orderBy: { timestamp: 'asc' },
  });
}

export async function runAgent(agent: any, userInput: string, llm: 'openai' | 'ollama' = 'openai') {
  const prompt = `${agent.prompt}\nUser: ${userInput}`;
  if (llm === 'openai') {
    return callOpenAI([{ role: 'system', content: prompt }]);
  } else {
    return callOllama([{ role: 'system', content: prompt }]);
  }
}

export async function runSynthesis(agentReplies: { name: string; reply: string }[], userInput: string) {
  // Synthesize a final response from all agent replies
  const synthesisPrompt = `Given the following agent replies to the user input, synthesize a single response.\nUser: ${userInput}\n${agentReplies.map(a => `${a.name}: ${a.reply}`).join('\n')}\nSynthesis:`;
  return callOpenAI([{ role: 'system', content: synthesisPrompt }]);
} 