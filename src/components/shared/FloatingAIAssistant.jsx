import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, X, Send, Minimize2, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function FloatingAIAssistant({ agentName, displayName, role = "customer" }) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const isAdmin = role === "admin";
  const isHost = role === "host";

  const accentColor = isAdmin
    ? "from-violet-600 to-purple-700"
    : isHost
    ? "from-pink-500 to-rose-600"
    : "from-pink-500 to-fuchsia-600";

  const bubbleColor = isAdmin
    ? "bg-violet-600 hover:bg-violet-700"
    : "bg-primary hover:bg-primary/90";

  useEffect(() => {
    if (open && !conversation) {
      initConversation();
    }
  }, [open]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  useEffect(() => {
    if (open && !minimized && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, minimized]);

  const initConversation = async () => {
    setLoading(true);
    try {
      const conv = await base44.agents.createConversation({
        agent_name: agentName,
        metadata: { name: `${displayName} Session` },
      });
      setConversation(conv);
      setMessages(conv.messages || []);

      base44.agents.subscribeToConversation(conv.id, (data) => {
        setMessages(data.messages || []);
      });
    } catch (err) {
      console.error("Failed to init conversation", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !conversation || sending) return;
    const text = input.trim();
    setInput("");
    setSending(true);
    try {
      await base44.agents.addMessage(conversation, { role: "user", content: text });
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const visibleMessages = messages.filter(
    (m) => m.role === "user" || (m.role === "assistant" && m.content)
  );

  const isStreaming = messages.some(
    (m) => m.role === "assistant" && !m.content && m.status !== "done"
  );

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-110",
            bubbleColor
          )}
        >
          <MessageCircle className="h-6 w-6 text-white" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 w-[370px] rounded-3xl shadow-2xl border border-white/10 flex flex-col overflow-hidden transition-all duration-300",
            minimized ? "h-[64px]" : "h-[540px]",
            "bg-[hsl(var(--card))]"
          )}
          style={{ maxWidth: "calc(100vw - 24px)" }}
        >
          {/* Header */}
          <div className={cn("flex items-center gap-3 px-4 py-3 bg-gradient-to-r shrink-0", accentColor)}>
            <div className="h-9 w-9 rounded-xl overflow-hidden border-2 border-white/30 shrink-0">
              <img src={LOGO_ICON} alt="uRide" className="h-full w-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-white font-black text-sm truncate">{displayName}</p>
                <Sparkles className="h-3 w-3 text-white/70" />
              </div>
              <p className="text-white/60 text-xs">Powered by uRide AI</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setMinimized((p) => !p)}
                className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <Minimize2 className="h-3.5 w-3.5 text-white" />
              </button>
              <button
                onClick={() => { setOpen(false); setMinimized(false); }}
                className="h-7 w-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {loading && (
                  <div className="flex justify-center items-center h-full">
                    <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin" />
                  </div>
                )}

                {!loading && visibleMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-8">
                    <div className={cn("h-14 w-14 rounded-2xl flex items-center justify-center bg-gradient-to-br", accentColor)}>
                      <Sparkles className="h-7 w-7 text-white" />
                    </div>
                    <div>
                      <p className="font-black text-foreground text-sm">Hi, I'm your {displayName}</p>
                      <p className="text-muted-foreground text-xs mt-1">Ask me anything. I'm here to help.</p>
                    </div>
                  </div>
                )}

                {visibleMessages.map((msg, i) => (
                  <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "assistant" && (
                      <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-gradient-to-br", accentColor)}>
                        <Sparkles className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-secondary text-foreground rounded-bl-sm"
                      )}
                    >
                      {msg.role === "assistant" ? (
                        <ReactMarkdown className="prose prose-sm prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 text-sm">
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex gap-2 justify-start">
                    <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br", accentColor)}>
                      <Sparkles className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="bg-secondary rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex gap-1 items-center">
                        <div className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
                        <div className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
                        <div className="h-1.5 w-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
                <div className="flex gap-2 items-end bg-secondary rounded-2xl px-3 py-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything…"
                    rows={1}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none max-h-24 min-h-[24px]"
                    style={{ lineHeight: "1.5" }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sending || !conversation}
                    className={cn(
                      "h-8 w-8 rounded-xl flex items-center justify-center transition-all shrink-0",
                      input.trim() && !sending
                        ? `bg-gradient-to-br ${accentColor} text-white`
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-center text-[10px] text-muted-foreground mt-1.5">Press Enter to send · Shift+Enter for new line</p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}