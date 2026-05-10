import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useOutletContext } from "react-router-dom";
import { Send, Bot, Plus, HelpCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

const AGENT = "renter_assistant";

export default function RenterAIChat() {
  const { brand } = useOutletContext() || {};
  const brandColor = brand?.brand_color || "#e91e8c";
  const secondaryColor = brand?.secondary_color || "#7c3aed";
  const heroGradient = `linear-gradient(135deg, ${brandColor}, ${secondaryColor})`;
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
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Hero header */}
      <div className="relative overflow-hidden flex-shrink-0" style={{ background: heroGradient }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 30%, rgba(255,255,255,0.15) 0%, transparent 60%)" }} />
        <div className="relative z-10 px-5 pt-6 pb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center" style={{ background: heroGradient }}>
              <HelpCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="font-black text-white text-lg" style={{ fontFamily: "var(--font-syne)" }}>Support</h1>
              <p className="text-white/40 text-xs">Private · Instant · AI-powered</p>
            </div>
          </div>
          <button onClick={newConversation} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white/70 bg-white/10 hover:bg-white/20 transition-all">
            <Plus className="h-3.5 w-3.5" /> New
          </button>
        </div>
        {conversations.length > 1 && (
          <div className="flex gap-2 px-5 pb-4 overflow-x-auto no-scrollbar">
            {conversations.map(c => (
              <button key={c.id} onClick={() => selectConversation(c.id)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${activeConvId === c.id ? "bg-white text-gray-900" : "bg-white/10 text-white/50 hover:text-white"}`}>
                {c.metadata?.name || "Chat"}
              </button>
            ))}
          </div>
        )}
        <div className="h-5"><svg viewBox="0 0 375 20" fill="#f8f8fa" className="w-full" preserveAspectRatio="none"><path d="M0 20L375 20L375 5C300 18 180 1 0 12L0 20Z"/></svg></div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white mx-4 mb-4 rounded-3xl border border-gray-100 shadow-sm">
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
              <div className="h-14 w-14 rounded-3xl flex items-center justify-center shadow-lg" style={{ background: heroGradient }}>
                <HelpCircle className="h-7 w-7 text-white" />
              </div>
              <p className="font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Hi! How can I help?</p>
              <p className="text-sm text-gray-400 max-w-xs">Ask about your rental, payments, vehicle, or account — instantly and privately.</p>
              <div className="grid grid-cols-1 gap-2 mt-2 w-full max-w-sm">
                {SUGGESTIONS.map(q => (
                  <button key={q} onClick={() => setInput(q)}
                    className="px-4 py-3 rounded-2xl bg-white border border-gray-200 text-sm text-gray-600 hover:border-pink-300 hover:text-gray-900 text-left transition-all shadow-sm">
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
            <div className="flex gap-2">
              <div className="h-8 w-8 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.1), hsl(265 80% 62% / 0.1))" }}>
                <Bot className="h-3.5 w-3.5 text-pink-500" />
              </div>
              <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white border border-gray-100 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-pink-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-3 py-3 border-t border-gray-100 bg-white">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your rental, payments…"
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-2xl bg-gray-50 border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 resize-none"
              style={{ minHeight: 42, maxHeight: 120 }}
            />
            <button onClick={sendMessage} disabled={!input.trim() || sending}
              className="h-10 w-10 rounded-2xl flex items-center justify-center disabled:opacity-40 transition-all flex-shrink-0 shadow-sm"
              style={{ background: heroGradient }}>
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RenterBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="h-8 w-8 rounded-2xl flex items-center justify-center mt-0.5 flex-shrink-0 shadow-sm" style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.1), hsl(265 80% 62% / 0.1))" }}>
          <Bot className="h-3.5 w-3.5 text-pink-500" />
        </div>
      )}
      <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${isUser ? "text-white" : "bg-white border border-gray-100 text-gray-900"}`}
        style={isUser ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}>
        {isUser ? (
          <p className="leading-relaxed">{message.content}</p>
        ) : (
          <ReactMarkdown className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            {message.content || "..."}
          </ReactMarkdown>
        )}
      </div>
    </div>
  );
}