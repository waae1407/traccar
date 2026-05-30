import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Eye, FileText, ShieldAlert } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PaymentAlertInsight from "./PaymentAlertInsight";

const OPEN_STATUSES = ["new", "notified", "acknowledged", "under_review", "retry_scheduled", "escalated"];
const STYLE = {
  critical: "border-red-300 bg-yellow-50 text-red-900",
  warning: "border-amber-300 bg-yellow-50 text-amber-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};

function appendAudit(alert, actionType, actorRole, actorId, previousStatus, newStatus, note) {
  return [
    ...(alert.audit_log || []),
    { action_type: actionType, actor_role: actorRole, actor_id: actorId || actorRole, timestamp: new Date().toISOString(), note: note || "", previous_status: previousStatus || alert.status, new_status: newStatus || alert.status }
  ];
}

export default function PaymentOperationalAlertPanel({ scope = "admin", hostId = null, compact = false, limit = 3, title = "Payment Operations Alerts" }) {
  const qc = useQueryClient();
  const [noteDraft, setNoteDraft] = useState({});
  const { data: alerts = [] } = useQuery({
    queryKey: ["payment-operational-alerts", scope, hostId],
    queryFn: () => scope === "host" && hostId
      ? base44.entities.PaymentOperationalAlert.filter({ host_id: hostId }, "-created_date", 100)
      : base44.entities.PaymentOperationalAlert.list("-created_date", 100),
    enabled: scope !== "host" || !!hostId,
    refetchInterval: 30_000,
  });

  const openAlerts = useMemo(() => alerts.filter(a => OPEN_STATUSES.includes(a.status)).slice(0, limit), [alerts, limit]);

  const updateAlert = useMutation({
    mutationFn: async ({ alert, status, actionType, note }) => {
      if ((status === "resolved" || status === "closed") && alert.severity === "critical" && !note?.trim()) {
        throw new Error("Critical alerts require resolution notes.");
      }
      const actorRole = scope === "host" ? "host" : "admin";
      await base44.entities.PaymentOperationalAlert.update(alert.id, {
        status,
        manually_actioned: true,
        manually_actioned_at: new Date().toISOString(),
        manually_actioned_by: actorRole,
        action_taken: actionType,
        ...(status === "acknowledged" && scope === "admin" ? { admin_acknowledged: true, admin_acknowledged_at: new Date().toISOString() } : {}),
        ...(status === "acknowledged" && scope === "host" ? { host_acknowledged: true, host_acknowledged_at: new Date().toISOString() } : {}),
        ...(status === "resolved" || status === "closed" ? { resolved_at: new Date().toISOString(), resolved_by: actorRole, resolution_notes: note } : {}),
        audit_log: appendAudit(alert, actionType, actorRole, actorRole, alert.status, status, note),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["payment-operational-alerts"] }),
  });

  if (openAlerts.length === 0) return null;

  return (
    <div className="rounded-3xl border-2 border-yellow-300 bg-yellow-50 p-4 shadow-[0_10px_30px_rgba(234,179,8,0.18)] rotate-[-0.2deg]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-yellow-700" />
          <div>
            <h3 className="font-black text-yellow-950 text-sm">{title}</h3>
            <p className="text-xs text-yellow-700">Visible until acknowledged, reviewed, or resolved.</p>
          </div>
        </div>
        {scope === "admin" && <Link to="/admin/payment-alerts" className="text-xs font-black text-yellow-900 underline">Open Center</Link>}
      </div>
      <div className="space-y-3">
        {openAlerts.map(alert => {
          const note = noteDraft[alert.id] || "";
          return (
            <div key={alert.id} className={`rounded-2xl border p-3 ${STYLE[alert.severity] || STYLE.warning}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-wide">{alert.severity}</span>
                    <span className="text-[10px] font-bold opacity-60">{alert.billing_context}</span>
                  </div>
                  <p className="font-black text-sm mt-1">{alert.title}</p>
                  <p className="text-xs mt-1 opacity-80">{alert.message}</p>
                  {!compact && <p className="text-xs mt-2 font-semibold">Action: {alert.recommended_action}</p>}
                  <PaymentAlertInsight alert={alert} scope={scope} compact={compact} />
                </div>
                {alert.severity === "critical" ? <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" /> : <Clock className="h-5 w-5 flex-shrink-0" />}
              </div>
              {!compact && (
                <div className="mt-3 space-y-2">
                  <input value={note} onChange={e => setNoteDraft(p => ({ ...p, [alert.id]: e.target.value }))} placeholder="Add note / resolution notes" className="w-full rounded-xl border border-black/10 bg-white/70 px-3 py-2 text-xs outline-none" />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => updateAlert.mutate({ alert, status: "acknowledged", actionType: "acknowledged", note })} className="px-3 py-1.5 rounded-xl bg-white/70 text-xs font-bold border border-black/10 flex items-center gap-1"><Eye className="h-3 w-3" /> Acknowledge</button>
                    <button onClick={() => updateAlert.mutate({ alert, status: "under_review", actionType: "marked_under_review", note })} className="px-3 py-1.5 rounded-xl bg-white/70 text-xs font-bold border border-black/10 flex items-center gap-1"><FileText className="h-3 w-3" /> Under review</button>
                    <button onClick={() => updateAlert.mutate({ alert, status: "resolved", actionType: "resolved", note })} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Resolve</button>

                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}