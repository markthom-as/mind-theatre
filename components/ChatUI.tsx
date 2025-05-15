import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from 'lucide-react';

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
interface Message {
  name?: string;
  reply?: string;
  color?: string;
  user?: string;
  type?: string; // 'user', 'agent', 'psyche'
  valence?: number;
  arousal?: number;
  timestamp?: string; // Added timestamp
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

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<string[]>([]); // Stays as string[]
  const [selectedAgent, setSelectedAgent] = useState<string>(''); // Stays as string
  const [agentMemory, setAgentMemory] = useState<AgentMemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false); // This is for sending messages
  const [isHistoryLoading, setIsHistoryLoading] = useState(false); // For loading initial chat history
  const [isMemoryLoading, setIsMemoryLoading] = useState(false); // For loading agent memory
  const [chatId, setChatId] = useState<string | null>(null);
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
      console.log("Attempting to ensure chat session...");
      const match = window.location.pathname.match(/\/chat\/(.+)$/);
      let id = match ? match[1] : null;
      console.log("Initial id from URL:", id);

      if (!id) {
        console.log("No id in URL, attempting to start a new chat via API...");
        try {
          const resp = await fetch('/api/start_chat', { method: 'POST' });
          console.log("API response status:", resp.status);
          if (resp.ok) {
            const data = await resp.json();
            console.log("API response data:", data);
            id = data.chatId;
            console.log("New id from API:", id);
            if (id) { // Only update history if id is valid
              window.history.replaceState({}, '', `/chat/${id}`);
              console.log("Updated window history with new id:", id);
            } else {
              console.error("Error: chat_id from API is null or undefined.");
            }
          } else {
            console.error("API call to /api/start_chat failed:", resp.status, await resp.text());
            // id remains null here
          }
        } catch (error) {
          console.error("Error fetching /api/start_chat:", error);
          // id remains null here
        }
      }
      setChatId(id);
      console.log("Final chatId set to state:", id);
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
          const msgs = await resp.json();
          setMessages(msgs.map((msg: any) => ({
            ...msg,
            name: msg.agent_name || msg.sender || msg.name,
            reply: msg.text || msg.reply,
            type: msg.type,
            valence: msg.valence ?? 0,
            arousal: msg.arousal ?? 0,
            color: msg.color || '#888888', // Default color
            timestamp: msg.timestamp, // Added timestamp from history
            user: msg.type === 'user' ? msg.text : undefined,
          })));
        } else {
          console.error("Failed to load chat history:", resp.status);
          setMessages([]); // Clear messages on error or set to an error state message
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
        setMessages([]); // Clear messages on error
      } finally {
        setIsHistoryLoading(false);
      }
    }
    loadHistory();
  }, [chatId]);

  // Fetch agent list
  useEffect(() => {
    async function fetchAgents() {
      const resp = await fetch('/api/agents');
      if (resp.ok) {
        // The API returns AgentConfig[]
        const agentConfigs: AgentConfig[] = await resp.json(); 
        const agentNames: string[] = agentConfigs.map(config => config.name);
        setAgents(agentNames); // agents state is now string[]
        if (agentNames.length && !selectedAgent) { // selectedAgent is a string
          setSelectedAgent(agentNames[0]); // Set to the name (string)
        }
      }
    }
    fetchAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch agent memory
  useEffect(() => {
    if (!selectedAgent) return;
    async function fetchMemory() {
      setIsMemoryLoading(true);
      try {
        const resp = await fetch(`/api/agent_memory/${selectedAgent}`);
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
  }, [selectedAgent]);

  // Send message
  async function sendMessage() {
    if (!input.trim() || !chatId || isLoading) return;
    setIsLoading(true);
    setMessages((msgs) => [
      ...msgs,
      { user: input, type: 'user', timestamp: new Date().toISOString() }, // Added timestamp
      ...agents.map((name) => ({ name, reply: 'Thinking...', type: 'agent', color: undefined, valence: undefined, arousal: undefined }))
    ]);
    setInput('');
    console.log("sendMessage: chatId before fetch:", chatId);
    const res = await fetch(`/api/chat/${chatId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: input })
    });
    const data = await res.json();
    setMessages((msgs) => {
      let trimmed = [...msgs];
      let count = 0;
      for (let i = trimmed.length - 1; i >= 0 && count < agents.length; i--) {
        if (trimmed[i].type === 'agent' && trimmed[i].reply === 'Thinking...') {
          trimmed.splice(i, 1);
          count++;
        }
      }
      const agentMsgs = (data.agent_dialogue || []).map((entry: any) => ({
        name: entry.name,
        reply: entry.reply,
        type: 'agent',
        color: entry.color || '#888888', // Default color
        valence: entry.valence ?? 0,
        arousal: entry.arousal ?? 0,
        timestamp: entry.timestamp || new Date().toISOString(), 
      }));
      const psycheMsg = data.psyche_response
        ? [{
            name: 'Psyche',
            reply: data.psyche_response.text,
            type: 'psyche',
            valence: data.psyche_response.valence ?? 0,
            arousal: data.psyche_response.arousal ?? 0,
            color: data.psyche_response.color || 'magenta', // Default Psyche color
            timestamp: data.psyche_response.timestamp || new Date().toISOString(),
          }]
        : [];
      return [...trimmed, ...agentMsgs, ...psycheMsg];
    });
    setIsLoading(false);
  }

  // Clear memory
  async function clearMemory() {
    await fetch('/api/clear_memory', { method: 'POST' });
    setAgentMemory([]);
  }

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between bg-gray-800 text-gray-100 px-6 h-14 border-b border-gray-700 fixed z-20" style={{ width: 'calc(100% - 360px)'}}>
        <div className="font-semibold text-xl text-purple-400 tracking-wide">Mind Theatre</div>
      </header>
      {/* Main Layout */}
      <div className="flex flex-1 pt-14 relative">
        {/* Main Chat */}
        <main className="flex flex-col flex-1 min-h-0 pr-[360px]">
          <div className="flex-1 flex flex-col overflow-y-auto px-6 py-4 gap-4" ref={chatLogRef}>
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
                  bubbleClass = 'self-start bg-gray-700 text-gray-100 border-l-4'; // Default card for agent reply
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
                  key={i}
                  className={`p-3 rounded-lg max-w-[75%] relative ${bubbleClass}`}
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
        {/* Sidebar */}
        <aside className="fixed right-0 top-0 bottom-0 w-[360px] border-l border-gray-700 flex flex-col bg-gray-800 text-gray-100">
          <div className="h-14 border-b border-gray-700 flex items-center px-4">
            <h2 className="text-lg font-semibold text-purple-400">Agent Memory</h2>
          </div>
          <div className="p-4 flex flex-col flex-1">
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger className="w-full mb-2 bg-gray-700 border-gray-600 text-gray-100 focus:ring-purple-500">
                <SelectValue placeholder="Select agent" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600 text-gray-100">
                {agents.map(name => (
                  <SelectItem key={name} value={name} className="hover:bg-gray-600 focus:bg-gray-600 data-[highlighted]:bg-gray-600 data-[state=checked]:bg-purple-500">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1 overflow-y-auto text-sm space-y-3">
              {isMemoryLoading && (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                </div>
              )}
              {!isMemoryLoading && agentMemory.length === 0 && <div className="text-gray-400">No memory for this agent.</div>}
              {!isMemoryLoading && agentMemory.map((entry, i) => (
                <Card key={i} className="p-3 border-b border-gray-600 last:border-b-0 bg-gray-700 text-gray-100">
                  <div className="text-xs text-gray-400 mb-1 flex justify-between">
                    <span>{new Date(entry.timestamp).toLocaleString()}</span>
                    {typeof entry.recallCount === 'number' && (
                      <span className="text-xs text-purple-400">Recalled: {entry.recallCount} times</span>
                    )}
                  </div>
                  {entry.userPrompt && (
                    <div className="bg-gray-600 text-gray-300 text-xs px-2 py-1 mb-2 border-l-4 border-yellow-500 rounded">
                      <span className="font-bold text-purple-400 mr-1">Prompt:</span>
                      {entry.userPrompt}
                    </div>
                  )}
                  <div className="text-gray-100 mb-1">{entry.text}</div>
                  <div className="relative h-10">
                    <ValenceArousal valence={entry.valence} arousal={entry.arousal} />
                  </div>
                </Card>
              ))}
            </div>
            {/* <AffectGridKey /> */} 
            {null}
            <div className="pt-4 mt-auto border-t border-gray-700">
              <Button variant="outline" className="w-full border-gray-600 text-gray-300 hover:bg-gray-700 hover:text-gray-100 focus:ring-purple-500" onClick={clearMemory}>
                Clear Selected Agent's Memory
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
} 