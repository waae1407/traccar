import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MessageSquare, Search, Filter, AlertTriangle, CheckCircle, Clock, Archive, Eye, Send, Paperclip } from "lucide-react";
import { format, differenceInHours } from "date-fns";

const THREAD_TYPE_LABELS = {
  booking_conversation: "Booking", support_ticket: "Support", dispute_thread: "Dispute",
  maintenance_discussion: "Maintenance", compliance_request: "Compliance",
  admin_notice: "Admin Notice", payout_discussion: "Payout", vehicle_issue: "Vehicle Issue",
};

const STATUS_CONFIG = {
  open: { color: "bg-blue-100 text-blue-700", label: "Open" },
  awaiting_host: { color: "bg-yellow-100 text-yellow-700", label: "Awaiting Host" },
  awaiting_customer: { color: "bg-yellow-100 text-yellow-700", label: "Awaiting Customer" },
  awaiting_admin: { color: "bg-orange-100 text-orange-700", label: "Awaiting Admin" },
  resolved: { color: "bg-green-100 text-green-700", label: "Resolved" },
  archived: { color: "bg-gray-100 text-gray-600", label: "Archived" },
};

const PRIORITY_CONFIG = {
  urgent: { color: "text-red-600", icon: "🔴" },
  high: { color: "text-orange-600", icon: "🟠" },
  normal: { color: "text-blue-600", icon: "🔵" },
  low: { color: "text-gray-500", icon: "⚪" },
};

export default function AdminCommunications() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    thread_type: "", status: "", priority: "", escalation: false, unresolved: true,
  });
  const [selectedThread, setSelectedThread] = useState(null);
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [internalNote, setInternalNote] = useState(false);

  const { data: threads = [], isLoading, refetch } = useQuery({
    queryKey: ["admin-comm-threads", filters, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filters.thread_type) params.set("thread_type", filters.thread_type);
      if (filters.status) params.set("status", filters.status);
      if (filters.priority) params.set("priority", filters.priority);
      if (filters.escalation) params.set("escalation", "true");
      if (filters.unresolved) params.set("unresolved", "true");
      params.set("limit", "100");

      const res = await base44.functions.invoke("searchCommunicationThreads", {}, { params });
      return res.data.threads || [];
    },
  });

  const { data: threadDetail } = useQuery({
    queryKey: ["admin-comm-thread-detail", selectedThread?.id],
    queryFn: async () => {
      if (!selectedThread) return null;
      const res = await base44.functions.invoke("getCommunicationThread", {}, { params: { thread_id: selectedThread.id } });
      return res.data;
    },
    enabled: !!selectedThread,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data) => {
      const res = await base44.functions.invoke("sendCommunicationMessage", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-comm-threads"] });
      qc.invalidateQueries({ queryKey: ["admin-comm-thread-detail", selectedThread?.id] });
      setMessageBody("");
      setShowMessageForm(false);
    },
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ thread_id, action, reason }) => {
      const res = await base44.functions.invoke("moderateCommunicationThread", { thread_id, action, reason });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-comm-threads"] });
      qc.invalidateQueries({ queryKey: ["admin-comm-thread-detail", selectedThread?.id] });
    },
  });

  const kpis = useMemo(() => {
    const open = threads.filter(t => t.status === "open" || t.status.includes("awaiting")).length;
    const escalated = threads.filter(t => t.escalation_flag).length;
    const slaBreached = threads.filter(t => t.sla_breached).length;
    const urgent = threads.filter(t => t.priority === "urgent").length;
    return { open, escalated, slaBreached, urgent };
  }, [threads]);

  const handleSendMessage = () => {
    if (!messageBody.trim() || !selectedThread) return;
    sendMessageMutation.mutate({
      thread_id: selectedThread.id,
      message_type: internalNote ? "internal_note" : "text",
      body: messageBody,
      internal_note: internalNote,
    });
  };

  const handleModerate = (action, reason) => {
    if (!selectedThread) return;
    moderateMutation.mutate({ thread_id: selectedThread.id, action, reason });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Communications Center</h1>
          <p className="text-sm text-muted-foreground mt-1">Operational messaging, disputes and support threads</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard value={kpis.open} label="Open Threads" color="text-blue-600" bg="bg-blue-50 border-blue-200" />
        <KpiCard value={kpis.escalated} label="Escalated" color="text-red-600" bg="bg-red-50 border-red-200" />
        <KpiCard value={kpis.slaBreached} label="SLA Breached" color="text-orange-600" bg="bg-orange-50 border-orange-200" />
        <KpiCard value={kpis.urgent} label="Urgent" color="text-purple-600" bg="bg-purple-50 border-purple-200" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary/50"
          />
        </div>
        <FilterSelect value={filters.thread_type} onChange={(v) => setFilters({ ...filters, thread_type: v })} options={Object.entries(THREAD_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} placeholder="All Types" />
        <FilterSelect value={filters.status} onChange={(v) => setFilters({ ...filters, status: v })} options={[["", "All Status"], ["open", "Open"], ["awaiting_host", "Awaiting Host"], ["awaiting_customer", "Awaiting Customer"], ["awaiting_admin", "Awaiting Admin"], ["resolved", "Resolved"]].map(([v, l]) => ({ value: v, label: l }))} placeholder="Status" />
        <FilterSelect value={filters.priority} onChange={(v) => setFilters({ ...filters, priority: v })} options={[["", "All Priorities"], ["urgent", "Urgent"], ["high", "High"], ["normal", "Normal"], ["low", "Low"]].map(([v, l]) => ({ value: v, label: l }))} placeholder="Priority" />
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border text-xs font-medium cursor-pointer">
          <input type="checkbox" checked={filters.escalation} onChange={(e) => setFilters({ ...filters, escalation: e.target.checked })} className="rounded" />
          Escalated Only
        </label>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border text-xs font-medium cursor-pointer">
          <input type="checkbox" checked={filters.unresolved} onChange={(e) => setFilters({ ...filters, unresolved: e.target.checked })} className="rounded" />
          Unresolved Only
        </label>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6 h-[calc(100vh-280px)]">
        {/* Thread List */}
        <div className="col-span-1 bg-card rounded-2xl border border-border overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Threads ({threads.length})</h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 rounded-xl bg-muted/30 animate-pulse" />)}</div>
            ) : threads.length === 0 ? (
              <div className="text-center py-12"><MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" /><p className="text-sm text-muted-foreground">No threads found</p></div>
            ) : (
              threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedThread(t)}
                  className={`w-full px-4 py-3 border-b border-border/50 hover:bg-muted/40 text-left transition-colors ${selectedThread?.id === t.id ? "bg-muted/60" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-xs font-bold text-foreground">{THREAD_TYPE_LABELS[t.thread_type] || t.thread_type}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_CONFIG[t.status]?.color || "bg-gray-100 text-gray-600"}`}>{STATUS_CONFIG[t.status]?.label || t.status}</span>
                        {t.escalation_flag && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 flex items-center gap-1"><AlertTriangle className="h-2 w-2" /> Escalated</span>}
                        {t.sla_breached && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 flex items-center gap-1"><Clock className="h-2 w-2" /> SLA</span>}
                      </div>
                      <p className="text-sm font-semibold text-foreground truncate">{t.subject}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                        <span>{t.host_name || "Unknown Host"}</span>
                        {t.customer_name && <span>· {t.customer_name}</span>}
                        {t.last_message_at && <span>· {format(new Date(t.last_message_at), "MMM d, h:mm a")}</span>}
                      </div>
                    </div>
                    {(t.unread_count_admin || 0) > 0 && (
                      <span className="h-5 min-w-[1.25rem] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{t.unread_count_admin}</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Thread Detail */}
        <div className="col-span-2 bg-card rounded-2xl border border-border overflow-hidden flex flex-col">
          {selectedThread ? (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h2 className="text-lg font-bold text-foreground">{threadDetail?.thread?.subject}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded ${STATUS_CONFIG[threadDetail?.thread?.status]?.color}`}>{STATUS_CONFIG[threadDetail?.thread?.status]?.label}</span>
                    {threadDetail?.thread?.escalation_flag && <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Escalated</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{THREAD_TYPE_LABELS[threadDetail?.thread?.thread_type]}</span>
                    <span>· Host: {threadDetail?.thread?.host_name}</span>
                    {threadDetail?.thread?.customer_name && <span>· Customer: {threadDetail?.thread?.customer_name}</span>}
                    {threadDetail?.thread?.vehicle_info && <span>· Vehicle: {threadDetail.thread.vehicle_info.name}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleModerate("assign")} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-foreground bg-muted hover:bg-muted/60">Assign</button>
                  <button onClick={() => handleModerate(threadDetail?.thread?.escalation_flag ? "deescalate" : "escalate")} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-foreground bg-muted hover:bg-muted/60">{threadDetail?.thread?.escalation_flag ? "De-escalate" : "Escalate"}</button>
                  <button onClick={() => handleModerate("archive")} className="px-3 py-1.5 rounded-xl text-xs font-semibold text-foreground bg-muted hover:bg-muted/60 flex items-center gap-1"><Archive className="h-3 w-3" /> Archive</button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {threadDetail?.messages?.map((m) => (
                  <MessageBubble key={m.id} message={m} isAdmin />
                ))}
              </div>

              {/* Message Form */}
              <div className="p-4 border-t border-border">
                {showMessageForm ? (
                  <div className="space-y-3">
                    <textarea
                      value={messageBody}
                      onChange={(e) => setMessageBody(e.target.value)}
                      placeholder={internalNote ? "Internal note (invisible to host/customer)..." : "Type your message..."}
                      className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-sm focus:outline-none focus:border-primary/50 resize-none"
                      rows={3}
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                        <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} className="rounded" />
                        <span className={internalNote ? "text-orange-600" : "text-muted-foreground"}>Internal note (invisible to host/customer)</span>
                      </label>
                      <div className="flex gap-2">
                        <button onClick={() => setShowMessageForm(false)} className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground bg-muted">Cancel</button>
                        <button onClick={handleSendMessage} disabled={sendMessageMutation.isPending || !messageBody.trim()} className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"><Send className="h-3.5 w-3.5" /> Send</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setShowMessageForm(true)} className="w-full py-3 rounded-xl text-sm font-semibold text-muted-foreground bg-muted hover:bg-muted/60 flex items-center justify-center gap-2"><Send className="h-4 w-4" /> Reply</button>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center"><MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" /><p className="text-sm">Select a thread to view details</p></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ value, label, color, bg }) {
  return (
    <div className={`rounded-2xl border p-4 ${bg}`}>
      <p className={`text-2xl font-black ${color}`} style={{ fontFamily: "var(--font-syne)" }}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 px-3 rounded-xl bg-card border border-border text-xs font-medium focus:outline-none focus:border-primary/50 cursor-pointer">
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function MessageBubble({ message, isAdmin }) {
  const isSystem = message.message_type === "system_event";
  const isInternal = message.internal_note || message.message_type === "internal_note";

  return (
    <div className={`flex gap-3 ${message.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
      {message.sender_role !== "admin" && <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{message.sender_name?.[0]?.toUpperCase()}</div>}
      <div className={`max-w-[70%] ${message.sender_role === "admin" ? "items-end" : "items-start"} flex flex-col`}>
        <div className={`rounded-2xl px-4 py-3 ${message.sender_role === "admin" ? "bg-primary text-primary-foreground" : isInternal ? "bg-orange-50 border border-orange-200" : "bg-muted"}`}>
          {isInternal && <p className="text-[10px] font-bold text-orange-600 mb-1 flex items-center gap-1"><Eye className="h-2.5 w-2.5" /> Internal Note</p>}
          <p className={`text-sm ${message.sender_role === "admin" ? "text-white" : "text-foreground"}`}>{message.body}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
          <span>{message.sender_name}</span>
          <span>·</span>
          <span>{format(new Date(message.created_at), "MMM d, h:mm a")}</span>
          {message.attachments?.length > 0 && <span className="flex items-center gap-1"><Paperclip className="h-2.5 w-2.5" /> {message.attachments.length} attachment{message.attachments.length > 1 ? "s" : ""}</span>}
        </div>
      </div>
    </div>
  );
}