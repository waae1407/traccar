import React, { useState } from "react";
import { X, ExternalLink, CheckCircle2, Clock, UserPlus, MessageSquare, Archive } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";

const alertEntities = ["PaymentOperationalAlert", "OperationalAlert"];

export default function UnifiedOpsDrawer({ item, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  if (!item) return null;

  const canUpdate = alertEntities.includes(item.entityName);
  const updateAlert = async (patch) => {
    if (!canUpdate) return;
    setBusy(true);
    await base44.entities[item.entityName].update(item.id, patch);
    setBusy(false);
    onChanged?.();
  };

  const openSource = () => {
    if (item.actionUrl) window.location.href = item.actionUrl;
  };

  const assign = async () => {
    const assignedTo = window.prompt("Assign to email or team name");
    if (!assignedTo) return;
    const assignedRole = window.prompt("Assigned role: admin, host, customer, installer, or system", "admin") || "admin";
    await updateAlert({ assigned_to: assignedTo, assigned_role: assignedRole, admin_assigned_to: assignedTo });
  };

  const resolve = async () => {
    const resolutionNotes = window.prompt("Resolution notes", "Resolved from Unified Operations Center") || "Resolved";
    await updateAlert({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: "admin", resolution_notes: resolutionNotes });
  };

  const snooze = async () => {
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await updateAlert({ status: "waiting_on_host", due_at: dueAt });
  };

  const createThread = async () => {
    setBusy(true);
    const thread = await base44.entities.CommunicationThread.create({
      thread_type: "admin_notice",
      status: "open",
      priority: item.severity === "critical" ? "urgent" : item.severity === "high" ? "high" : "normal",
      subject: item.title,
      booking_request_id: item.bookingId,
      vehicle_id: item.vehicleId,
      host_id: item.hostId,
      assigned_admin_id: item.assignedTo,
      escalation_flag: ["critical", "high"].includes(item.severity),
      last_message_at: new Date().toISOString(),
    });
    if (canUpdate) await base44.entities[item.entityName].update(item.id, { communication_thread_id: thread.id });
    setBusy(false);
    onChanged?.();
    window.location.href = `/admin/communications?thread=${thread.id}`;
  };

  const openThread = () => {
    if (item.threadId) window.location.href = `/admin/communications?thread=${item.threadId}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <button className="flex-1" onClick={onClose} />
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-slate-950 p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">{item.kind} · {item.domain}</p>
            <h2 className="mt-2 text-2xl font-black text-white">{item.title}</h2>
            <p className="mt-2 text-sm text-white/50">{item.message}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          {[['Severity', item.severity], ['Status', item.status], ['Source', item.sourceType], ['Source ID', item.sourceId], ['Host', item.hostId], ['Vehicle', item.vehicleId], ['Booking', item.bookingId], ['Assigned', item.assignedTo || 'Unassigned']].map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">{k}</p>
              <p className="mt-1 break-words text-white/80">{v || '—'}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button onClick={openSource} variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10"><ExternalLink className="h-4 w-4" />Open source record</Button>
          {item.threadId ? <Button onClick={openThread} variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10"><MessageSquare className="h-4 w-4" />Open thread</Button> : <Button onClick={createThread} disabled={busy} variant="outline" className="border-white/10 bg-white/5 text-white hover:bg-white/10"><MessageSquare className="h-4 w-4" />Create thread</Button>}
          {canUpdate && <Button onClick={() => updateAlert({ status: "acknowledged" })} disabled={busy}><CheckCircle2 className="h-4 w-4" />Acknowledge</Button>}
          {canUpdate && <Button onClick={() => updateAlert({ status: "in_progress" })} disabled={busy}><Clock className="h-4 w-4" />Mark in progress</Button>}
          {canUpdate && <Button onClick={assign} disabled={busy} variant="secondary"><UserPlus className="h-4 w-4" />Assign</Button>}
          {canUpdate && <Button onClick={snooze} disabled={busy} variant="secondary"><Clock className="h-4 w-4" />Snooze 24h</Button>}
          {canUpdate && <Button onClick={resolve} disabled={busy} className="bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-4 w-4" />Resolve</Button>}
          {canUpdate && <Button onClick={() => updateAlert({ status: "dismissed" })} disabled={busy} variant="destructive"><Archive className="h-4 w-4" />Dismiss</Button>}
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/40">Raw context</p>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs text-white/45">{JSON.stringify(item.raw, null, 2)}</pre>
        </div>
      </aside>
    </div>
  );
}