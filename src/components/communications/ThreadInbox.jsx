import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, formatDistanceToNowStrict } from "date-fns";
import { AlertTriangle, Inbox, Paperclip, Plus, Search } from "lucide-react";
import ThreadDetail from "./ThreadDetail";

const threadTypes = [
  ["", "All Types"],
  ["booking_conversation", "Booking"],
  ["support_ticket", "Support"],
  ["dispute_thread", "Dispute"],
  ["maintenance_discussion", "Maintenance"],
  ["compliance_request", "Compliance"],
  ["admin_notice", "Admin Notice"],
  ["payout_discussion", "Payout"],
  ["vehicle_issue", "Vehicle Issue"],
];

const statuses = [["", "All Status"], ["open", "Open"], ["awaiting_host", "Awaiting Host"], ["awaiting_customer", "Awaiting Customer"], ["awaiting_admin", "Awaiting Admin"], ["resolved", "Resolved"], ["archived", "Archived"]];

const typeLabel = Object.fromEntries(threadTypes);

function roleTitle(role) {
  if (role === "admin") return "Communications Center";
  if (role === "host") return "Operational Messages";
  return "Messages & Support";
}

function roleSubtitle(role) {
  if (role === "admin") return "Admin oversight, moderation, evidence, and operational communication.";
  if (role === "host") return "Keep rental, maintenance, payout, and dispute conversations organized.";
  return "Secure communication about bookings, support, and disputes.";
}

export default function ThreadInbox({ role = "customer", canCreate = true }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filters, setFilters] = useState({ search: "", thread_type: "", status: "", unresolved: role !== "customer", unread: false, attachments: false, escalation: false });
  const [newThread, setNewThread] = useState({ thread_type: "support_ticket", subject: "", initial_message: "", priority: "normal" });

  const { data = { threads: [] }, isLoading } = useQuery({
    queryKey: ["communication-threads", role, filters],
    queryFn: async () => {
      const res = await base44.functions.invoke("searchCommunicationThreads", { ...filters, limit: 150 });
      return res.data;
    },
  });

  const threads = data.threads || [];
  const selectedThread = useMemo(() => threads.find(t => t.id === selectedId) || null, [threads, selectedId]);

  const { data: detail } = useQuery({
    queryKey: ["communication-thread-detail", selectedId],
    queryFn: async () => {
      const res = await base44.functions.invoke("getCommunicationThread", { thread_id: selectedId });
      return res.data;
    },
    enabled: !!selectedId,
  });

  const sendMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("sendCommunicationMessage", { thread_id: selectedId, ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communication-threads"] });
      qc.invalidateQueries({ queryKey: ["communication-thread-detail", selectedId] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("createCommunicationThread", payload),
    onSuccess: (res) => {
      setShowCreate(false);
      setNewThread({ thread_type: "support_ticket", subject: "", initial_message: "", priority: "normal" });
      qc.invalidateQueries({ queryKey: ["communication-threads"] });
      setSelectedId(res.data.thread.id);
    },
  });

  const moderateMutation = useMutation({
    mutationFn: (action) => base44.functions.invoke("moderateCommunicationThread", { thread_id: selectedId, action }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["communication-threads"] });
      qc.invalidateQueries({ queryKey: ["communication-thread-detail", selectedId] });
    },
  });

  const kpis = useMemo(() => ({
    open: threads.filter(t => ["open", "awaiting_host", "awaiting_customer", "awaiting_admin"].includes(t.status)).length,
    unread: threads.reduce((sum, t) => sum + (t.my_unread_count || 0), 0),
    escalated: threads.filter(t => t.escalation_flag).length,
    evidence: threads.filter(t => (t.attachment_count || 0) > 0).length,
  }), [threads]);

  return (
    <div className="min-h-[calc(100vh-120px)] p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>{roleTitle(role)}</h1>
          <p className="text-sm text-muted-foreground mt-1">{roleSubtitle(role)}</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold text-white bg-primary shadow-sm">
            <Plus className="h-4 w-4" /> New Thread
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 md:gap-3">
        <Kpi value={kpis.open} label="Open" />
        <Kpi value={kpis.unread} label="Unread" />
        <Kpi value={kpis.escalated} label="Escalated" danger />
        <Kpi value={kpis.evidence} label="Evidence" />
      </div>

      {showCreate && (
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(newThread); }} className="rounded-3xl border border-border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={newThread.thread_type} onChange={(e) => setNewThread(p => ({ ...p, thread_type: e.target.value }))} className="px-4 py-3 rounded-2xl bg-muted border border-border text-sm">
              {threadTypes.filter(([v]) => v).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select value={newThread.priority} onChange={(e) => setNewThread(p => ({ ...p, priority: e.target.value }))} className="px-4 py-3 rounded-2xl bg-muted border border-border text-sm">
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
            <input value={newThread.subject} onChange={(e) => setNewThread(p => ({ ...p, subject: e.target.value }))} required placeholder="Subject" className="px-4 py-3 rounded-2xl bg-muted border border-border text-sm" />
          </div>
          <textarea value={newThread.initial_message} onChange={(e) => setNewThread(p => ({ ...p, initial_message: e.target.value }))} placeholder="Describe the issue or operational update..." className="w-full px-4 py-3 rounded-2xl bg-muted border border-border text-sm resize-none" rows={3} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-muted text-muted-foreground">Cancel</button>
            <button type="submit" disabled={createMutation.isPending} className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-primary disabled:opacity-50">Create</button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={filters.search} onChange={(e) => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search messages, booking IDs, VINs..." className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-card border border-border text-sm" />
        </div>
        <select value={filters.thread_type} onChange={(e) => setFilters(p => ({ ...p, thread_type: e.target.value }))} className="px-3 py-2.5 rounded-2xl bg-card border border-border text-xs font-semibold">{threadTypes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={filters.status} onChange={(e) => setFilters(p => ({ ...p, status: e.target.value }))} className="px-3 py-2.5 rounded-2xl bg-card border border-border text-xs font-semibold">{statuses.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <Toggle label="Unread" active={filters.unread} onClick={() => setFilters(p => ({ ...p, unread: !p.unread }))} />
        <Toggle label="Evidence" active={filters.attachments} onClick={() => setFilters(p => ({ ...p, attachments: !p.attachments }))} />
        {role === "admin" && <Toggle label="Escalated" active={filters.escalation} onClick={() => setFilters(p => ({ ...p, escalation: !p.escalation }))} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-360px)] min-h-[620px]">
        <div className="lg:col-span-4 bg-card rounded-3xl border border-border overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">Threads ({threads.length})</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? <div className="p-4 space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)}</div> : threads.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center p-8 text-muted-foreground"><div><Inbox className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No communication threads found.</p></div></div>
            ) : threads.map(thread => (
              <button key={thread.id} onClick={() => setSelectedId(thread.id)} className={`w-full text-left px-4 py-3 border-b border-border/60 hover:bg-muted/40 ${selectedThread?.id === thread.id ? "bg-muted/60" : ""}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{typeLabel[thread.thread_type]}</span>
                      {thread.escalation_flag && <AlertTriangle className="h-3 w-3 text-red-500" />}
                      {(thread.attachment_count || 0) > 0 && <Paperclip className="h-3 w-3 text-muted-foreground" />}
                    </div>
                    <p className="text-sm font-bold text-foreground truncate">{thread.subject}</p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{thread.host_name || ""}{thread.customer_name ? ` · ${thread.customer_name}` : ""}{thread.vehicle_label ? ` · ${thread.vehicle_label}` : ""}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{thread.last_message_at ? formatDistanceToNowStrict(new Date(thread.last_message_at), { addSuffix: true }) : format(new Date(thread.created_date), "MMM d")}</p>
                  </div>
                  {(thread.my_unread_count || 0) > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center">{thread.my_unread_count}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-8 min-h-0">
          <ThreadDetail
            detail={detail}
            role={role}
            onSend={(payload) => sendMutation.mutate(payload)}
            onModerate={role === "admin" ? (action) => moderateMutation.mutate(action) : null}
            sending={sendMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}

function Kpi({ value, label, danger = false }) {
  return <div className={`rounded-2xl border p-3 text-center bg-card ${danger && value > 0 ? "border-red-200 bg-red-50" : "border-border"}`}><p className={`text-xl font-black ${danger && value > 0 ? "text-red-600" : "text-foreground"}`}>{value}</p><p className="text-[10px] text-muted-foreground font-semibold">{label}</p></div>;
}

function Toggle({ label, active, onClick }) {
  return <button type="button" onClick={onClick} className={`px-3 py-2.5 rounded-2xl border text-xs font-bold ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"}`}>{label}</button>;
}