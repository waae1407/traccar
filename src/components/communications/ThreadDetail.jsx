import React from "react";
import { format } from "date-fns";
import { AlertTriangle, Download, FileText, Lock, Paperclip, Shield } from "lucide-react";
import ThreadComposer from "./ThreadComposer";

const typeLabels = {
  booking_conversation: "Booking",
  support_ticket: "Support",
  dispute_thread: "Dispute",
  maintenance_discussion: "Maintenance",
  compliance_request: "Compliance",
  admin_notice: "Admin Notice",
  payout_discussion: "Payout",
  vehicle_issue: "Vehicle Issue",
};

const statusColors = {
  open: "bg-blue-100 text-blue-700",
  awaiting_host: "bg-yellow-100 text-yellow-700",
  awaiting_customer: "bg-yellow-100 text-yellow-700",
  awaiting_admin: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  archived: "bg-gray-100 text-gray-600",
};

function MessageBubble({ message, role }) {
  const mine = message.sender_role === role;
  const system = message.sender_role === "system" || message.message_type === "system_event";
  const internal = message.internal_note || message.message_type === "internal_note";

  if (system) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[90%] px-3 py-2 rounded-xl bg-muted text-muted-foreground text-xs border border-border">
          {message.body}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[84%] ${mine ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className={`rounded-2xl px-4 py-3 ${mine ? "bg-primary text-primary-foreground" : internal ? "bg-orange-50 text-orange-900 border border-orange-200" : "bg-muted text-foreground"}`}>
          {internal && <p className="text-[10px] font-bold text-orange-600 mb-1 flex items-center gap-1"><Shield className="h-3 w-3" /> Internal Note</p>}
          <p className="text-sm whitespace-pre-wrap">{message.body}</p>
          {message.attachments?.length > 0 && (
            <div className="mt-3 space-y-2">
              {message.attachments.map((file, index) => (
                <a key={`${file.url}-${index}`} href={file.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2 bg-white/15 border border-white/20 text-xs font-semibold hover:opacity-80">
                  <FileText className="h-3.5 w-3.5" />
                  <span className="truncate">{file.filename || "Evidence file"}</span>
                  <Download className="h-3 w-3 ml-auto" />
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
          <span>{message.sender_name || message.sender_role}</span>
          <span>·</span>
          <span>{format(new Date(message.created_at || message.created_date), "MMM d, h:mm a")}</span>
          {message.attachments?.length > 0 && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" /> {message.attachments.length}</span>}
        </div>
      </div>
    </div>
  );
}

export default function ThreadDetail({ detail, role, onSend, onModerate, sending = false }) {
  if (!detail?.thread) {
    return (
      <div className="h-full flex items-center justify-center text-center text-muted-foreground p-8">
        <div>
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Select a thread to view the operational timeline.</p>
        </div>
      </div>
    );
  }

  const { thread, messages = [] } = detail;
  const locked = thread.frozen || thread.status === "archived" || thread.status === "resolved";
  const isAdmin = role === "admin";

  return (
    <div className="h-full flex flex-col bg-card rounded-3xl border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-primary/10 text-primary">{typeLabels[thread.thread_type] || thread.thread_type}</span>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-lg ${statusColors[thread.status] || "bg-muted text-muted-foreground"}`}>{thread.status?.replace(/_/g, " ")}</span>
            {thread.escalation_flag && <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-red-100 text-red-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Escalated</span>}
            {thread.frozen && <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-gray-100 text-gray-700 flex items-center gap-1"><Lock className="h-3 w-3" /> Frozen</span>}
          </div>
          <h2 className="text-lg font-black text-foreground truncate">{thread.subject}</h2>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {thread.host_info?.name && `Host: ${thread.host_info.name}`}
            {thread.customer_id && ` · Customer: ${thread.booking_info?.customer_name || thread.customer_id}`}
            {thread.vehicle_info?.name && ` · Vehicle: ${thread.vehicle_info.name}`}
          </p>
        </div>

        {isAdmin && onModerate && (
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => onModerate(thread.escalation_flag ? "deescalate" : "escalate")} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-muted text-foreground">{thread.escalation_flag ? "De-escalate" : "Escalate"}</button>
            <button onClick={() => onModerate(thread.frozen ? "unfreeze" : "freeze")} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-muted text-foreground">{thread.frozen ? "Unfreeze" : "Freeze"}</button>
            <button onClick={() => onModerate("close")} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-green-100 text-green-700">Resolve</button>
            <button onClick={() => onModerate("archive")} className="px-3 py-1.5 rounded-xl text-xs font-bold bg-gray-100 text-gray-700">Archive</button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => <MessageBubble key={message.id} message={message} role={role} />)}
      </div>

      <div className="p-4 border-t border-border">
        <ThreadComposer
          onSend={onSend}
          allowInternal={role === "admin" || role === "host"}
          disabled={locked || sending}
          placeholder="Add an operational update, evidence, or question..."
        />
      </div>
    </div>
  );
}