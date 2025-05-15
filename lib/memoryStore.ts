export const memoryStore = {
  clearMemory: () => {},
  addMessage: (chatId: string, sender: string, text: string, opts?: any) => {},
  getMessages: (chatId: string) => [],
  createChat: (chatId: string) => true,
};

export const agentWorkingMemories: Record<string, any[]> = {}; 