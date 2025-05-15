import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowUp, ArrowDown, Info } from 'lucide-react';
import InfoModal from './InfoModal';

// Helper function to process color string
const getProcessedColorForTailwind = (colorInput?: string): { type: 'hex' | 'class' | 'none', value?: string } => {
  if (!colorInput) return { type: 'none' };
  const trimmed = colorInput.trim();

  if (trimmed.startsWith('#')) {
    return { type: 'hex', value: trimmed };
  }

  // It's a string, potentially a Tailwind class name
  // If it's a simple word (e.g., "red", "green") without a numeric shade or hyphen,
  // append a default shade. This is a heuristic.
  if (/^[a-zA-Z]+$/.test(trimmed)) { // Simple word like "red", "green"
    return { type: 'class', value: `${trimmed}-500` };
  }
  
  // Assumed to be a full Tailwind class name already (e.g., "red-500", "sky-700", "light-blue-500")
  return { type: 'class', value: trimmed };
};

// Helper for truncating logs - MOVED HERE
const truncateLog = (message: any, length = 100) => {
  const stringified = typeof message === 'string' ? message : JSON.stringify(message);
  return stringified.length > length ? stringified.substring(0, length) + '...' : stringified;
};

// --- UI helpers (could be split into separate files) ---
function ValenceArousal({ valence, arousal }: { valence?: number; arousal?: number }) {
  if (valence == null && arousal == null) return null; // Show if at least one is present

  const valenceColor = valence != null ? (valence < -0.2 ? 'text-red-500' : valence > 0.2 ? 'text-green-500' : 'text-yellow-500') : '';
  const arousalColor = arousal != null ? (arousal > 0.7 ? 'text-orange-500' : 'text-blue-500') : '';

  return (
    <div className="absolute right-3 bottom-1 text-xs flex flex-col items-end gap-1 pt-1">
      <div className="flex gap-2 text-gray-400">
        {valence != null && <span className={valenceColor}>Valence: {valence.toFixed(2)}</span>}
        {arousal != null && <span className={arousalColor}>Arousal: {arousal.toFixed(2)}</span>}
      </div>
    </div>
  );
}

function AffectGridKey() {
  return (
    // <div className="mt-4 p-4 bg-slate-700 text-slate-200 rounded border border-slate-600 text-sm">
    //   <strong>Affect Grid Key:</strong>
    //   <svg width="40" height="40" className="inline-block mx-2 align-middle">
    //     <rect x="0" y="0" width="40" height="40" rx="6" fill="#2d3748" stroke="#4a5568" strokeWidth="1" />
    //     <circle cx="8" cy="32" r="5" fill="#f87171" stroke="#3b82f6" strokeWidth="2" /> 
    //     <circle cx="20" cy="20" r="5" fill="#fde047" stroke="#8b5cf6" strokeWidth="2" />
    //     <circle cx="32" cy="8" r="5" fill="#4ade80" stroke="#f97316" strokeWidth="2" />
    //   </svg>
    //   <div className="mt-2 space-y-1">
    //     <span className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded-full bg-red-400 border-2 border-blue-500"></span>Low valence (red), low arousal (blue)</span><br />
    //     <span className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded-full bg-yellow-400 border-2 border-purple-500"></span>Neutral valence (yellow), medium arousal (purple)</span><br />
    //     <span className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded-full bg-green-400 border-2 border-orange-500"></span>High valence (green), high arousal (orange)</span>
    //   </div>
    // </div>
    null
  );
}

// --- Main ChatUI component ---
interface MessageUI {
  id: string; // Ensure id is always a string for React key
  name?: string;
  reply?: string;
  color?: string;
  user?: string;
  type?: string; // 'user', 'agent', 'psyche', 'error'
  valence?: number;
  arousal?: number;
  timestamp?: string;
}

// Add AgentConfig interface here for clarity, duplicating from loadPrompts.ts if necessary
// or ideally importing it if this file becomes a .ts or .tsx file that allows imports from other .ts files.
// For now, assuming it's implicitly known or defined elsewhere.
// For the purpose of this edit, we'll assume AgentConfig has at least a 'name' property.
interface AgentConfig { // Minimal definition for this context
  name: string;
  // Other properties like prompt, llm_params, color might exist on the fetched object
  [key: string]: any; // Allow other properties
}

interface AgentMemoryEntry {
  text: string;
  timestamp: string;
  valence: number;
  arousal: number;
  userPrompt: string | null;
  recallCount?: number;
}

// Define AgentDialogueEntry interface for client-side type safety
interface AgentDialogueEntry {
  id: string; // ID of the created agent message
  name: string;
  reply: string;
  color: string;
  valence: number | null;
  arousal: number | null;
  timestamp?: string; // Server might send this
}

// Define PsycheMessagePayload interface for client-side type safety
interface PsycheMessagePayload {
  id: string;
  sender: 'Psyche'; // Should always be Psyche
  text: string;
  type: 'psyche';
  color?: string | null;
  valence: number | null;
  arousal: number | null;
  timestamp: string; // Prisma Message has a Date, but it's serialized as string
}

export default function ChatUI() {
  const [messages, setMessages] = useState<MessageUI[]>([]);
  const [input, setInput] = useState('');
  const [agentsConfig, setAgentsConfig] = useState<AgentConfig[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [agentMemory, setAgentMemory] = useState<AgentMemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isMemoryLoading, setIsMemoryLoading] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [memorySortField, setMemorySortField] = useState<'timestamp' | 'recallCount'>('timestamp');
  const [memorySortOrder, setMemorySortOrder] = useState<'asc' | 'desc'>('desc');
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const chatLogRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom on new message
  useEffect(() => {
    if (chatLogRef.current) {
      chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
    }
  }, [messages]);

  // Get or create chat session
  useEffect(() => {
    async function ensureChatSession() {
      const match = window.location.pathname.match(/.+\/chat\/(.+)$/);
      let id = match ? match[1] : null;

      if (!id) {
        try {
          const resp = await fetch('/api/start_chat', { method: 'POST' });
          if (resp.ok) {
            const data = await resp.json();
            id = data.chatId;
            if (id) { 
              window.history.replaceState({}, '', `/chat/${id}`);
            } else {
              console.error("Error: chat_id from API is null or undefined.");
            }
          } else {
            console.error("API call to /api/start_chat failed:", resp.status, await resp.text());
          }
        } catch (error) {
          console.error("Error fetching /api/start_chat:", error);
        }
      }
      setChatId(id);
    }
    ensureChatSession();
  }, []);

  // Load chat history
  useEffect(() => {
    if (!chatId) return;
    async function loadHistory() {
      setIsHistoryLoading(true);
      try {
        const resp = await fetch(`/api/chat/${chatId}/history`);
        if (resp.ok) {
          const msgsFromServer = await resp.json();
          setMessages(msgsFromServer.map((msg: any) => ({
            id: msg.id || Date.now().toString() + Math.random(), // Ensure ID
            name: msg.agent_name || msg.sender || msg.name,
            reply: msg.text || msg.reply,
            type: msg.type,
            valence: msg.valence ?? undefined,
            arousal: msg.arousal ?? undefined,
            color: msg.color || (msg.type === 'user' ? 'transparent' : (msg.type === 'psyche' ? 'magenta-500' : 'gray-500')),
            timestamp: msg.timestamp, 
            user: msg.type === 'user' ? msg.text : undefined,
          })));
        } else {
          console.error("Failed to load chat history:", resp.status);
          setMessages([]);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
        setMessages([]);
      } finally {
        setIsHistoryLoading(false);
      }
    }
    loadHistory();
  }, [chatId]);

  // Fetch agent list (AgentConfig objects)
  useEffect(() => {
    async function fetchAgents() {
      const resp = await fetch('/api/agents');
      if (resp.ok) {
        const agentConfigsData: AgentConfig[] = await resp.json(); 
        setAgentsConfig(agentConfigsData);
        if (agentConfigsData.length && !selectedAgent) {
          setSelectedAgent(agentConfigsData[0].name);
        }
      }
    }
    fetchAgents();
  }, [selectedAgent]);

  // Fetch agent memory
  useEffect(() => {
    if (!selectedAgent) return;
    async function fetchMemory() {
      setIsMemoryLoading(true);
      try {
        const resp = await fetch(`/api/agent_memory/${selectedAgent}?sortBy=${memorySortField}&sortOrder=${memorySortOrder}`);
        if (resp.ok) {
          setAgentMemory(await resp.json());
        } else {
          console.error("Failed to load agent memory:", resp.status);
          setAgentMemory([]);
        }
      } catch (error) {
        console.error("Error fetching agent memory:", error);
        setAgentMemory([]);
      } finally {
        setIsMemoryLoading(false);
      }
    }
    fetchMemory();
  }, [selectedAgent, memorySortField, memorySortOrder]);

  async function sendMessage() {
    const currentInput = input.trim();
    if (!currentInput || !chatId || isLoading) return;
    setIsLoading(true);
    setInput(''); // Clear input after grabbing its value

    const userMessageId = Date.now().toString() + '_user';
    const userMessage: MessageUI = {
      id: userMessageId,
      user: currentInput,
      type: 'user',
      timestamp: new Date().toISOString(),
      color: 'transparent' // Or a specific user color
    };
    setMessages((msgs) => {
      const newState = [...msgs, userMessage];
      return newState;
    });

    // Add agent placeholders
    const agentPlaceholders: MessageUI[] = agentsConfig.map(agent => ({
      id: `${agent.name}_${userMessageId}_placeholder`,
      name: agent.name,
      reply: 'Thinking...',
      type: 'agent',
      color: agent.color || 'grey-500', // Use agent's configured color or default
      timestamp: new Date().toISOString(),
    }));
    setMessages(prev => {
      const newState = [...prev, ...agentPlaceholders];
      return newState;
    });

    try {
      const response = await fetch(`/api/chat/${chatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to process stream request.' }));
        throw new Error(errorData.message || `API Error: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null.');
      }

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        
        if (value) {
          // console.log("[ChatUI] Stream chunk received:", truncateLog(value)); 
        }

        if (done) {
          setIsLoading(false); // Ensure loading is false if stream ends before 'event: done' from server
          break;
        }

        buffer += value;
        let eolIndex;
        
        while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
          const eventString = buffer.substring(0, eolIndex).trim();
          buffer = buffer.substring(eolIndex + 2);

          if (eventString.startsWith('event: done')) {
            setIsLoading(false);
            return; 
          }

          if (eventString.startsWith('data: ')) {
            const jsonString = eventString.substring('data: '.length);
            if (jsonString.trim() === "") {
              await new Promise(resolve => setTimeout(resolve, 0)); // Yield even for empty payload to prevent tight loop on bad data
              continue;
            }
            try {
              const eventData = JSON.parse(jsonString);

              if (eventData.type === 'user_message') {
                // Optional: Update user message with ID from DB if needed
              } else if (eventData.type === 'agent_update') {
                const agentPayload = eventData.payload as AgentDialogueEntry;
                setMessages(prev => {
                  const updated = prev.map(msg => 
                    (msg.name === agentPayload.name && msg.reply === 'Thinking...') ? 
                    {
                      ...msg, 
                      id: agentPayload.id, 
                      reply: agentPayload.reply,
                      color: getProcessedColorForTailwind(agentPayload.color).value || msg.color, 
                      valence: agentPayload.valence ?? undefined,
                      arousal: agentPayload.arousal ?? undefined,
                      timestamp: agentPayload.timestamp || new Date().toISOString(), 
                    } : msg
                  );
                  if (JSON.stringify(prev) === JSON.stringify(updated)) {
                    // console.warn(`[ChatUI] Agent placeholder for ${agentPayload.name} not found or already updated. Current prev state:`, truncateLog(prev));
                  }
                  return updated;
                });
              } else if (eventData.type === 'psyche_response') {
                const psychePayload = eventData.payload as PsycheMessagePayload;
                setMessages(prev => {
                  const newState = [...prev, {
                    id: psychePayload.id,
                    name: 'Psyche',
                    reply: psychePayload.text,
                    type: 'psyche',
                    color: getProcessedColorForTailwind(psychePayload.color || 'magenta-600').value,
                    valence: psychePayload.valence ?? undefined,
                    arousal: psychePayload.arousal ?? undefined,
                    timestamp: psychePayload.timestamp || new Date().toISOString(),
                  } as MessageUI];
                  return newState;
                });
              } else if (eventData.type === 'agent_error' || eventData.type === 'error') {
                const errorPayload = eventData.payload as { name?: string; message: string };
                if (errorPayload.name) { // Agent-specific error
                  setMessages(prev => prev.map(msg => 
                    (msg.name === errorPayload.name && msg.reply === 'Thinking...') ? 
                    { ...msg, reply: `Error: ${errorPayload.message}`, color: 'red-500' } : msg
                  ));
                } else { // General error
                  setMessages(prev => [...prev, {
                    id: Date.now().toString() + '_error',
                    name: 'System Error',
                    reply: errorPayload.message,
                    type: 'error',
                    color: 'red-500',
                    timestamp: new Date().toISOString(),
                  }]);
                }
              }
            } catch (e) {
              // console.error("[ChatUI] Error parsing streamed JSON or updating UI:", e, "Original JSON string:", jsonString);
            }
          }
          await new Promise(resolve => setTimeout(resolve, 0)); 
        }
      }
    } catch (error) {
      console.error("[ChatUI] Error sending message or processing stream:", error);
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_general_error',
        name: 'System Error',
        reply: error instanceof Error ? error.message : 'An unexpected error occurred.',
        type: 'error',
        color: 'red-500',
        timestamp: new Date().toISOString(),
      }]);
      setIsLoading(false); // Ensure isLoading is set to false in case of error
    }
  }

  // Clear memory
  async function clearMemory() {
    await fetch('/api/clear_memory', { method: 'POST' });
    setAgentMemory([]);
  }

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-row">
      {/* Main Content Pane (Navbar + Chat) */}
      <div className="flex-1 flex flex-col h-screen">
        {/* Top Bar / Navbar */}
        <header className="flex items-center justify-between bg-gray-800 text-gray-100 px-6 h-14 border-b border-gray-700 flex-shrink-0">
          <Link href="/">
            <div className="flex items-center font-semibold text-xl text-purple-400 tracking-wide">
              <span role="img" aria-label="brain icon" className="mr-2">🧠</span>
              <span>Mind Theatre</span>
              <span className="ml-2 px-1 py-1 text-[0.6rem] font-semibold leading-none bg-yellow-500 text-yellow-900 rounded-md">BETA</span>
            </div>
          </Link>
          <div className="flex space-x-2 items-center">
            <Button variant="ghost" size="icon" onClick={() => setIsInfoModalOpen(true)} className="text-gray-400 hover:text-purple-400">
              <Info className="h-7 w-7" />
            </Button>
            {/* Add any other header components here */}
          </div>
        </header>

        {/* Chat Area (scrollable messages + fixed input) */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 gap-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-900" ref={chatLogRef}>
            {isHistoryLoading && (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            )}
            {!isHistoryLoading && messages.map((msg, i) => {
              let bubbleClass = '';
              let bubbleStyle = {}; // For potential inline styles like border color
              
              // Process color for agent and psyche messages (user messages don't have msg.color typically)
              const processedColor = (msg.type === 'agent' || msg.type === 'psyche') ? getProcessedColorForTailwind(msg.color) : { type: 'none' as 'none' };

              if (msg.type === 'user') {
                bubbleClass = 'self-end bg-purple-700 text-gray-100 border border-purple-600';
              } else if (msg.type === 'psyche') {
                bubbleClass = 'self-start bg-gray-700 text-gray-100 border-l-4 border-purple-500';
              } else if (msg.type === 'agent') {
                if (msg.reply === 'Thinking...') {
                  bubbleClass = 'self-start bg-gray-700 text-gray-400 border border-gray-600 animate-pulse';
                } else {
                  bubbleClass = 'self-start bg-gray-800 text-gray-100 border-l-4'; // Default card for agent reply. Changed bg-gray-700 to bg-gray-800
                  if (processedColor.type === 'hex') {
                    bubbleStyle = { borderColor: processedColor.value };
                    
                  } else if (processedColor.type === 'class' && processedColor.value) {
                    bubbleClass += ` border-${processedColor.value}`;
                    
                  } else {
                    bubbleClass += ' border-gray-600'; // Default border if no specific color
                    
                  }
                }
              } else {
                bubbleClass = 'self-start bg-gray-700 text-gray-400 border border-gray-600'; // Default for any other type
              }

              return (
                <div
                  key={msg.id}
                  className={`p-3 rounded-lg max-w-[75%] relative ${bubbleClass} my-2 ${msg.type === 'user' ? 'ml-auto' : 'mr-auto'}`}
                  style={bubbleStyle}
                >
                  <div className="flex flex-wrap items-baseline mb-1">
                    {(msg.type === 'user') ? (
                      <div className="font-semibold text-sm text-gray-300 mr-2">User</div>
                    ) : (
                      msg.name && (
                        <div
                          className={`font-semibold text-sm mr-2 ${processedColor.type === 'class' && processedColor.value ? `text-${processedColor.value}` : ''}`}
                          style={{ color: processedColor.type === 'hex' && processedColor.value ? processedColor.value : undefined }}
                        >
                          {msg.name}
                        </div>
                      )
                    )}

                    {/* Timestamp Part */}
                    {msg.timestamp && (
                      <div
                        className={`ml-2 text-xs ${
                          msg.type === 'user' ? 'text-white' : 'text-gray-400'
                        }`}
                      >
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    )}
                  </div>

                  {msg.type === 'user' && msg.user && (
                    <div className={`dark:text-gray-200 text-gray-800 text-[12px] leading-snug max-w-none break-words ${(msg.valence !== undefined || msg.arousal !== undefined) ? 'mb-6' : ''}`}>
                      <ReactMarkdown
                        components={{
                          p: ({node, ...props}) => <p className="mb-2" {...props} />
                        }}
                      >{msg.user}</ReactMarkdown>
                    </div>
                  )}
                  {msg.type !== 'user' && msg.reply && (
                    <div className={`dark:text-gray-200 text-gray-800 text-[12px] leading-snug max-w-none break-words ${(msg.valence !== undefined || msg.arousal !== undefined) ? 'mb-6' : ''}`}>
                      <ReactMarkdown
                        components={{
                          p: ({node, ...props}) => <p className="mb-2" {...props} />
                        }}
                      >{msg.reply}</ReactMarkdown>
                    </div>
                  )}
                  {(msg.valence !== undefined || msg.arousal !== undefined) && (
                    <ValenceArousal valence={msg.valence} arousal={msg.arousal} />
                  )}
                </div>
              );
            })}
            {isLoading && !isHistoryLoading && ( // Ensure general thinking spinner doesn't overlap with history loading
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin text-purple-500" /> <span>Thinking...</span>
              </div>
            )}
          </div>
          {/* Input Area */}
          <form
            className="flex items-end gap-2 border-t border-gray-700 bg-gray-900 px-6 py-4 sticky bottom-0 z-10"
            onSubmit={e => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <Textarea
              className="flex-1 resize-none min-h-[36px] max-h-[80px] bg-gray-800 border-gray-600 placeholder-gray-400 text-gray-100 focus:ring-purple-500 focus:border-purple-500"
              rows={3}
              placeholder="Type your message to the Psyche..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={isLoading}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button type="submit" disabled={isLoading || !input.trim()} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold">
              Send
            </Button>
          </form>
        </main>
      </div>

      {/* Sidebar */}
      <aside className="w-96 h-screen bg-gray-800 border-l border-gray-700 p-2 flex flex-col space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 flex-shrink-0">
        {/* Memory Controls Card */}
        <Card className="bg-gray-850 border-0 shadow-none flex-shrink-0">
          <CardHeader className="p-2">
            <CardTitle className="text-md text-purple-300">
              Memory Controls{selectedAgent ? `: ${selectedAgent}` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="flex items-center space-x-2">
              <div className="flex-1 min-w-0">
                {/* <label htmlFor="agent-select" className="block text-xs font-medium text-gray-400 mb-1">Agent</label> */}
                <Select onValueChange={setSelectedAgent} value={selectedAgent}>
                  <SelectTrigger id="agent-select" className="w-full bg-gray-700 border-gray-600 text-gray-100 h-8 text-xs">
                    <SelectValue placeholder="Select Agent" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-700 text-gray-100 border-gray-600">
                    {agentsConfig.map(agent => (
                      <SelectItem key={agent.name} value={agent.name} className="text-xs hover:bg-gray-600 focus:bg-gray-600">
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedAgent && (
                <>
                  <div className="flex-1 min-w-0">
                    {/* <label htmlFor="sort-field" className="block text-xs font-medium text-gray-400 mb-1">Sort by</label> */}
                    <Select value={memorySortField} onValueChange={(value) => setMemorySortField(value as 'timestamp' | 'recallCount')}>
                      <SelectTrigger id="sort-field" className="w-full bg-gray-700 border-gray-600 text-gray-100 text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-700 text-gray-100 border-gray-600">
                        <SelectItem value="timestamp" className="text-xs">Date</SelectItem>
                        <SelectItem value="recallCount" className="text-xs">Recalls</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-1 flex-shrink-0">
                    {/* <label className="block text-xs font-medium text-gray-400 mb-1 invisible">Order</label> */}
                    <Button
                      variant={memorySortOrder === 'asc' ? 'secondary' : 'outline'}
                      size="icon"
                      className="h-8 w-8 bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-100 data-[state=active]:bg-purple-600 data-[state=active]:border-purple-500"
                      onClick={() => setMemorySortOrder('asc')}
                      data-state={memorySortOrder === 'asc' ? 'active' : 'inactive'}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={memorySortOrder === 'desc' ? 'secondary' : 'outline'}
                      size="icon"
                      className="h-8 w-8 bg-gray-700 border-gray-600 hover:bg-gray-600 text-gray-100 data-[state=active]:bg-purple-600 data-[state=active]:border-purple-500"
                      onClick={() => setMemorySortOrder('desc')}
                      data-state={memorySortOrder === 'desc' ? 'active' : 'inactive'}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Memory List Card */}
        {selectedAgent && (
          <Card className="bg-gray-850 border-0 shadow-none flex-grow flex flex-col min-h-0">
            {/* <CardHeader className="p-2">
               <CardTitle className="text-md text-purple-400">Memories: {selectedAgent}</CardTitle>
            </CardHeader> */}
            <CardContent className="flex-grow flex flex-col min-h-0 p-0">
              <div className="flex-1 overflow-y-auto min-h-0 text-sm space-y-1 px-2 pt-1 pb-1 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                {isMemoryLoading && (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                  </div>
                )}
                {!isMemoryLoading && agentMemory.length === 0 && <div className="text-gray-400 p-4 text-center">No memories for this agent.</div>}
                {!isMemoryLoading && agentMemory.map((entry, i) => (
                  <Card key={i} className="p-2 border-b border-gray-700 last:border-b-0 bg-gray-700 text-gray-100 shadow-sm border-0">
                    <div className="text-xs text-gray-400 mb-1 flex justify-between">
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      {typeof entry.recallCount === 'number' && (
                        <span className="text-xs text-purple-400">Recalled: {entry.recallCount} times</span>
                      )}
                    </div>
                    {entry.userPrompt && (
                      <div className="bg-gray-600 text-gray-300 text-xs px-2 py-1 my-1 border-l-2 border-yellow-500 rounded">
                        <span className="font-bold text-purple-400 mr-1">Prompt:</span>
                        {entry.userPrompt}
                      </div>
                    )}
                    <div className="text-gray-100 mb-[2px] text-[12px]">{entry.text}</div>
                    <div className="relative h-8">
                      <ValenceArousal valence={entry.valence} arousal={entry.arousal} />
                    </div>
                  </Card>
                ))}
              </div>
            </CardContent>
            {/* <div className="p-2 border-t border-gray-700 mt-auto flex-shrink-0">
              <Button variant="outline" className="w-full border-red-700 text-red-400 hover:bg-red-700 hover:text-gray-100 focus:ring-red-500" onClick={clearMemory}>
                Clear Memories for {selectedAgent}
              </Button>
            </div> */}
          </Card>
        )}

        {!selectedAgent && !isMemoryLoading && (
          <div className="flex-grow flex items-center justify-center text-center p-2">
            <Card className="bg-gray-850 border-0 shadow-none p-4">
              <CardContent className="p-0">
                <p className="text-gray-400">
                  Select an agent from the "Memory Controls" above to view their memories.
                </p>
              </CardContent>
            </Card>
          </div>
        )}

      </aside>

      {isInfoModalOpen && <InfoModal onClose={() => setIsInfoModalOpen(false)} />}
    </div>
  );
} 