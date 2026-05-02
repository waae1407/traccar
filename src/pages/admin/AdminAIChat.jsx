import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, Bot, Trash2, Plus, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";

const AGENT = "admin_oracle";

export default function AdminAIChat() {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    loadConversations();
  }, []);

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
    if (convs?.length > 0 && !activeConvId) {
      const conv = await base44.agents.getConversation(convs[0].id);
      setActiveConvId(convs[0].id);
      setMessages(conv.messages || []);
    }
  };

  const newConversation = async () => {
    const conv = await base44.agents.createConversation({
      agent_name: AGENT,
      metadata: { name: `Admin Chat ${new Date().toLocaleDateString()}` },
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

  const isStreaming = messages.length > 0 && messages[messages.length - 1]?.role === "assistant" &&
    messages[messages.length - 1]?.status === "streaming";

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* Sidebar */}
      <div className="w-56 flex flex-col gap-2 flex-shrink-0">
        <button onClick={newConversation}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold text-white gradient-primary hover:opacity-90 transition-all">
          <Plus className="h-4 w-4" /> New Chat
        </button>
        <div className="flex-1 overflow-y-auto space-y-1">
          {conversations.map(c => (
            <button key={c.id} onClick={() => selectConversation(c.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all truncate ${activeConvId === c.id ? "bg-primary/20 text-white border border-primary/30" : "text-white/50 hover:bg-white/[0.06] hover:text-white"}`}>
              {c.metadata?.name || "Chat"}
            </button>
          ))}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col rounded-2xl border border-white/[0.08] glass overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Admin Oracle</p>
            <p className="text-xs text-white/40">Full platform access · Read-only</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <p className="font-bold text-white">Admin Oracle</p>
              <p className="text-sm text-white/40 max-w-xs">Ask me anything about the platform — bookings, hosts, renters, payments, compliance, reports, or analytics.</p>
              <div className="grid grid-cols-1 gap-2 mt-2 text-left w-full max-w-sm">
                {[
                  "How many active rentals do we have today?",
                  "Which hosts have overdue compliance docs?",
                  "Show me failed payments this week",
                  "Which vehicles are currently out of service?",
                ].map(q => (
                  <button key={q} onClick={() => { setInput(q); }}
                    className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-white/60 hover:text-white hover:border-primary/30 text-left transition-all">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.filter(m => m.role !== "system").map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          {sending && (
            <div className="flex gap-3">
              <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                <Bot className="h-4 w-4 text-primary" />
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

        {/* Input */}
        <div className="px-4 py-3 border-t border-white/[0.06]">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about the platform..."
              rows={1}
              className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-primary/50 resize-none"
              style={{ minHeight: 42, maxHeight: 120 }}
            />
            <button onClick={sendMessage} disabled={!input.trim() || sending}
              className="h-10 w-10 rounded-xl gradient-primary flex items-center justify-center disabled:opacity-40 transition-all flex-shrink-0">
              <Send className="h-4 w-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center mt-0.5 flex-shrink-0">
          <Bot className="h-3.5 w-3.5 text-primary" />
        </div>
      )}
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${isUser ? "bg-primary/20 border border-primary/30 text-white" : "bg-white/[0.06] border border-white/[0.06] text-white/90"}`}>
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