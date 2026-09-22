import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ShieldCheck, Send, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

/**
 * EscalateToAdminBanner — Host escalation widget for the Host AI Chat.
 * Lets hosts contact the platform admin team when AI can't help.
 * All escalations are urgent and notify admins via all channels.
 */
export default function EscalateToAdminBanner() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleEscalate = async () => {
    if (!message.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("escalateToAdmin", {
        subject: subject.trim() || undefined,
        message: message.trim(),
      });
      if (res.data?.error) {
        setError(res.data.error);
        setLoading(false);
        return;
      }
      setResult(res.data);
      setLoading(false);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const reset = () => {
    setOpen(false);
    setResult(null);
    setError(null);
    setSubject("");
    setMessage("");
  };

  // ── SUCCESS STATE ──
  if (result) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-sm animate-fade-in-up">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-2xl bg-emerald-500 flex items-center justify-center flex-shrink-0 shadow-md">
            <CheckCircle2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-emerald-900 text-sm" style={{ fontFamily: "var(--font-syne)" }}>
              Admin team has been contacted
            </p>
            <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
              Your urgent request was sent to the platform admin team. They've been notified via app, email, and SMS and will respond to you soon.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => navigate("/host/communications")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-sm"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
              >
                <Send className="h-3.5 w-3.5" /> Go to Messages
              </button>
              <button
                onClick={reset}
                className="px-4 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-white border border-emerald-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── FORM STATE ──
  if (open) {
    return (
      <div className="mx-4 mb-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-md animate-fade-in-up">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-black text-gray-900 text-sm" style={{ fontFamily: "var(--font-syne)" }}>
                Contact platform admin
              </p>
              <p className="text-[10px] text-gray-400">Urgent — admins will be notified via all channels</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="h-7 w-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 mb-2"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe what you need help with…"
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 resize-none mb-2"
        />

        {error && (
          <div className="flex items-start gap-2 mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">{error}</p>
          </div>
        )}

        <button
          onClick={handleEscalate}
          disabled={!message.trim() || loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-40 transition-all"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          {loading ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Contacting admin team…</>
          ) : (
            <><Send className="h-4 w-4" /> Send to admin team</>
          )}
        </button>
      </div>
    );
  }

  // ── IDLE STATE ──
  return (
    <div className="mx-4 mb-3">
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 bg-white hover:border-pink-300 hover:shadow-md transition-all group"
      >
        <div className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <ShieldCheck className="h-4.5 w-4.5 text-white" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-gray-900">Need admin help?</p>
          <p className="text-[11px] text-gray-400">Contact the platform admin team — urgent, all channels</p>
        </div>
        <Send className="h-4 w-4 text-gray-300 group-hover:text-pink-500 transition-colors" />
      </button>
    </div>
  );
}