import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Bot, Plus, HelpCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

const AGENT = "renter_assistant";

export default function RenterAIChat() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { loadConversations(); }, []);

  useEffect(() => {
    if (!activeConvId) return;
    const unsub = base44.agents.subscribeToConversation(activeConvId, (data) => {
      setMessages(data.messages || []);
    });
    return unsub;
  }, [activeConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    const convs = await base44.agents.listConversations({ agent_name: AGENT });
    setConversations(convs || []);
    if (convs?.length > 0) {
      const conv = await base44.agents.getConversation(convs[0].id);
      setActiveConvId(convs[0].id);
      setMessages(conv.messages || []);
    }
  };

  const newConversation = async () => {
    const conv = await base44.agents.createConversation({
      agent_name: AGENT,
      metadata: { name: `Support Chat ${new Date().toLocaleDateString()}` },
    });
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(conv.id);
    setMessages([]);
  };

  const selectConversation = async (id) => {
    const conv = await base44.agents.getConversation(id);
    setActiveConvId(id);
    setMessages(conv.messages || []);
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    let convId = activeConvId;
    if (!convId) {
      const conv = await base44.agents.createConversation({ agent_name: AGENT, metadata: { name: input.slice(0, 40) } });
      setConversations(prev => [conv, ...prev]);
      convId = conv.id;
      setActiveConvId(conv.id);
    }
    const text = input;
    setInput("");
    setSending(true);
    const conv = await base44.agents.getConversation(convId);
    await base44.agents.addMessage(conv, { role: "user", content: text });
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const SUGGESTIONS = [
    "When is my next payment?",
    "What's the status of my booking?",
    "How do I end my rental?",
    "Where do I pick up my car?",
    "How does autopay work?",
    "How do I use my referral credit?",
  ];

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-160px)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <HelpCircle className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-white text-lg font-syne">Support Assistant</h1>
          <p className="text-xs text-white/40">Ask anything about your rental, payments, or account</p>
        </div>
        <button onClick={newConversation} className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/60 bg-white/[0.06] border border-white/[0.08] hover:text-white transition-all">
          <Plus className="h-3.5 w-3.5" /> New
        </button>
      </div>

      {/* Conversation history pills */}
      {conversations.length > 1 && (
        <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
          {conversations.map(c => (
            <button key={c.id} onClick={() => selectConversation(c.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${activeConvId === c.id ? "bg-primary text-white" : "bg-white/[0.06] text-white/50 hover:text-white"}`}>
              {c.metadata?.name || "Chat"}
            </button>
          ))}
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 flex flex-col rounded-2xl border border-white/[0.08] glass overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <div className="h-14 w-14 rounded-2xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.15), hsl(265 80% 62% / 0.15))", border: "1px solid hsl(338 90% 56% / 0.2)" }}>
                <HelpCircle className="h-7 w-7 text-primary" />
              </div>
              <p className="font-bold text-white">Hi! How can I help you?</p>
              <p className="text-sm text-white/40 max-w-xs">I can answer questions about your rental, payments, vehicle, or account — privately and instantly.</p>
              <div className="grid grid-cols-1 gap-2 mt-2 w-full max-w-sm">
                {SUGGESTIONS.map(q => (
                  <button key={q} onClick={() => setInput(q)}
                    className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-white/60 hover:text-white hover:border-primary/30 text-left transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.filter(m => m.role !== "system").map((msg, i) => (
            <RenterBubble key={i} message={msg} />
          ))}
          {sending && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/[0.06] border border-white/[0.06]">
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 py-3 border-t border-white/[0.06]">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your rental, payments, vehicle..."
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-primary/50 resize-none"
              style={{ minHeight: 42, maxHeight: 120 }}
            />
            <button onClick={sendMessage} disabled={!input.trim() || sending}
              className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center disabled:opacity-40 transition-all flex-shrink-0">
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>
          <p className="text-[10px] text-white/20 text-center mt-2">Your conversations are private · Powered by uRide AI</p>
        </div>
      </div>
    </div>
  );
}

function RenterBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center mt-0.5 flex-shrink-0">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${isUser ? "gradient-primary text-white" : "bg-white/[0.06] border border-white/[0.06] text-white/90"}`}>
        {isUser ? (
          <p className="leading-relaxed">{message.content}</p>
        ) : (
          <ReactMarkdown className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {message.content || "..."}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}