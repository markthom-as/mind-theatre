import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';

// --- UI helpers (could be split into separate files) ---
function Spinner() {
  return (
    <div className="animate-spin rounded-full h-6 w-6 border-4 border-t-transparent border-primary mx-auto my-2" />
  );
}

function ValenceArousal({ valence, arousal }: { valence?: number; arousal?: number }) {
  if (valence == null || arousal == null) return null;
  const valenceColor = valence < -0.2 ? 'text-red-400' : valence > 0.2 ? 'text-green-400' : 'text-yellow-300';
  const arousalColor = arousal > 0.7 ? 'text-orange-400' : 'text-blue-400';
  const x = 20 + 18 * (valence || 0);
  const y = 40 - 36 * (arousal || 0);
  return (
    <div className="absolute right-3 bottom-1 text-xs flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <span className={valenceColor}>Valence: {valence.toFixed(2)}</span>
        <span className={arousalColor}>Arousal: {arousal.toFixed(2)}</span>
      </div>
      <svg width="40" height="40" className="mt-1">
        <rect x="0" y="0" width="40" height="40" rx="6" fill="#23262f" stroke="#444" strokeWidth="1" />
        <circle cx={x} cy={y} r="5" fill="#ffe066" stroke="#2196f3" strokeWidth="2" />
      </svg>
    </div>
  );
}

function AffectGridKey() {
  return (
    <div className="mt-4 p-2 bg-muted rounded border border-border text-sm">
      <strong>Affect Grid Key:</strong>
      <svg width="40" height="40" className="inline-block mx-2 align-middle">
        <rect x="0" y="0" width="40" height="40" rx="6" fill="#23262f" stroke="#444" strokeWidth="1" />
        <circle cx="8" cy="32" r="5" fill="#e45757" stroke="#2196f3" strokeWidth="2" />
        <circle cx="20" cy="20" r="5" fill="#ffe066" stroke="#7f5af0" strokeWidth="2" />
        <circle cx="32" cy="8" r="5" fill="#4caf50" stroke="#ff9800" strokeWidth="2" />
      </svg>
      <div className="mt-2 space-y-1">
        <span className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded-full bg-red-400 border-2 border-blue-400"></span>Low valence (red), low arousal (blue)</span><br />
        <span className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded-full bg-yellow-300 border-2 border-purple-400"></span>Neutral valence (yellow), medium arousal (purple)</span><br />
        <span className="flex items-center gap-2"><span className="inline-block w-4 h-4 rounded-full bg-green-400 border-2 border-orange-400"></span>High valence (green), high arousal (orange)</span>
      </div>
    </div>
  );
}

// --- Main ChatUI component ---
interface Message {
  name?: string;
  reply?: string;
  color?: string;
  user?: string;
  type?: string;
  valence?: number;
  arousal?: number;
}

interface AgentMemoryEntry {
  text: string;
  timestamp: string;
  valence: number;
  arousal: number;
  user_prompt: string;
}

export default function ChatUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [agents, setAgents] = useState<string[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const [agentMemory, setAgentMemory] = useState<AgentMemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
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
      const match = window.location.pathname.match(/\/chat\/(.+)$/);
      let id = match ? match[1] : null;
      if (!id) {
        const resp = await fetch('/api/start_chat', { method: 'POST' });
        if (resp.ok) {
          const data = await resp.json();
          id = data.chat_id;
          window.history.replaceState({}, '', `/chat/${id}`);
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
      const resp = await fetch(`/api/chat/${chatId}/history`);
      if (resp.ok) {
        const msgs = await resp.json();
        setMessages(msgs.map((msg: any) => ({
          ...msg,
          name: msg.agent_name || msg.sender || msg.name,
          reply: msg.text || msg.reply,
          type: msg.type,
          valence: msg.valence,
          arousal: msg.arousal,
          color: msg.color,
          user: msg.type === 'user' ? msg.text : undefined,
        })));
      }
    }
    loadHistory();
  }, [chatId]);

  // Fetch agent list
  useEffect(() => {
    async function fetchAgents() {
      const resp = await fetch('/api/agents');
      if (resp.ok) {
        const names = await resp.json();
        setAgents(names);
        if (names.length && !selectedAgent) setSelectedAgent(names[0]);
      }
    }
    fetchAgents();
    // eslint-disable-next-line
  }, []);

  // Fetch agent memory
  useEffect(() => {
    if (!selectedAgent) return;
    async function fetchMemory() {
      const resp = await fetch(`/api/agent_memory/${selectedAgent}`);
      if (resp.ok) {
        setAgentMemory(await resp.json());
      } else {
        setAgentMemory([]);
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
      { user: input, type: 'user' },
      ...agents.map((name) => ({ name, reply: 'Thinking...', type: 'agent', color: undefined, valence: undefined, arousal: undefined }))
    ]);
    setInput('');
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
        ...entry,
        type: 'agent',
      }));
      const psycheMsg = data.psyche_response
        ? [{ name: 'Psyche', reply: data.psyche_response, type: 'psyche', valence: data.valence, arousal: data.arousal }]
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
    <div className="min-h-screen bg-[#181a20] text-[#e0e0e0] flex flex-col">
      {/* Top Bar */}
      <header className="flex items-center justify-between bg-[#23262f] px-4 h-12 border-b border-[#23262f] fixed w-full z-10">
        <div className="font-semibold text-lg text-[#f6c177] tracking-wide">Mind Theatre</div>
      </header>
      {/* Main Layout */}
      <div className="flex flex-1 pt-12 relative">
        {/* Main Chat */}
        <main className="flex flex-col flex-1 pr-[340px] min-h-0">
          <div className="flex-1 flex flex-col overflow-y-auto px-4 py-2" ref={chatLogRef}>
            <div className="flex flex-col gap-4">
              {messages.map((msg, i) => {
                let bubbleClass =
                  msg.type === 'user'
                    ? 'self-end bg-[#2d3748] text-[#f6f6f6] border border-[#3a3f4b]'
                    : msg.type === 'psyche'
                    ? 'self-start bg-[#23262f] text-[#f6c177] border-l-4 border-[#f6c177]'
                    : msg.type === 'agent'
                    ? 'self-start bg-[#23262f] text-[#e0e0e0] border-l-4 border-[#7f5af0]'
                    : 'bg-[#2a2d38]';
                return (
                  <div
                    key={i}
                    className={`relative rounded-2xl px-5 py-2 max-w-[85%] shadow ${bubbleClass}`}
                    style={msg.color ? { borderColor: msg.color } : {}}
                  >
                    <span className="block font-bold text-sm mb-1" style={msg.color ? { color: msg.color } : {}}>
                      {msg.name || 'User'}
                    </span>
                    <span className="block text-sm whitespace-pre-wrap">
                      {msg.reply ? <ReactMarkdown>{msg.reply}</ReactMarkdown> : msg.user}
                    </span>
                    {(msg.type === 'agent' || msg.type === 'psyche') && (
                      <ValenceArousal valence={msg.valence} arousal={msg.arousal} />
                    )}
                  </div>
                );
              })}
              {isLoading && (
                <div className="flex items-center gap-2 text-[#b0b0b0]">
                  <Spinner /> <span>Thinking...</span>
                </div>
              )}
            </div>
          </div>
          {/* Input Area */}
          <form
            className="flex items-end gap-2 border-t border-[#23262f] bg-[#181a20] px-4 py-3"
            onSubmit={e => {
              e.preventDefault();
              sendMessage();
            }}
          >
            <textarea
              className="flex-1 resize-none rounded bg-[#23262f] text-[#f6f6f6] border border-[#353945] px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-[#7f5af0] min-h-[32px] max-h-[60px]"
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
            <button
              type="submit"
              className="px-5 py-2 bg-[#7f5af0] text-white rounded font-medium hover:bg-[#6246ea] transition disabled:opacity-60"
              disabled={isLoading || !input.trim()}
            >
              Send
            </button>
          </form>
        </main>
        {/* Sidebar */}
        <aside className="fixed right-0 top-0 h-full w-[340px] max-w-[420px] min-w-[300px] bg-[#20222a] text-[#e0e0e0] flex flex-col justify-between z-20 border-l border-[#23262f]">
          <div className="flex-1 flex flex-col gap-2 p-4 overflow-y-auto">
            <h3 className="text-base font-semibold text-[#f6c177] mb-2">Agent Memory</h3>
            <select
              className="w-full px-2 py-1 rounded border border-[#353945] bg-[#23262f] text-[#f6f6f6] text-sm mb-2"
              value={selectedAgent}
              onChange={e => setSelectedAgent(e.target.value)}
            >
              {agents.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <div className="flex-1 overflow-y-auto text-sm">
              {agentMemory.length === 0 && <div className="text-gray-400">No memory for this agent.</div>}
              {agentMemory.map((entry, i) => (
                <div key={i} className="mb-4 border-b border-[#353945] pb-2 last:border-b-0 last:pb-0">
                  <div className="text-xs text-gray-400 mb-1">{new Date(entry.timestamp).toLocaleString()}</div>
                  {entry.user_prompt && (
                    <div className="bg-[#23262f] text-yellow-300 text-xs px-2 py-1 mb-1 border-l-4 border-yellow-300 rounded">
                      <span className="font-bold text-[#f6c177] mr-1">Prompt:</span>
                      {entry.user_prompt}
                    </div>
                  )}
                  <div className="text-[#e0e0e0] mb-1">{entry.text}</div>
                  <div className="relative h-12">
                    <ValenceArousal valence={entry.valence} arousal={entry.arousal} />
                  </div>
                </div>
              ))}
            </div>
            <AffectGridKey />
          </div>
          <button
            className="w-full mt-2 py-2 bg-red-500 text-white rounded font-medium hover:bg-red-700 transition"
            onClick={clearMemory}
          >
            Clear Memory
          </button>
        </aside>
      </div>
    </div>
  );
} 