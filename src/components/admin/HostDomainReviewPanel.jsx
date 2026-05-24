import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Globe, ShieldCheck, XCircle, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

function Pill({ children, tone = "gray" }) {
  const colors = {
    gray: "bg-white/10 text-white/50 border-white/10",
    green: "bg-green-500/20 text-green-400 border-green-500/30",
    red: "bg-red-500/20 text-red-400 border-red-500/30",
    yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    blue: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  };
  return <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${colors[tone]}`}>{children}</span>;
}

export default function HostDomainReviewPanel({ host }) {
  const qc = useQueryClient();
  const { data: domains = [] } = useQuery({
    queryKey: ["admin-host-domains", host?.id],
    queryFn: () => base44.entities.HostCustomDomain.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.HostCustomDomain.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-host-domains", host?.id] }),
  });

  const verifyMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke("verifyHostCustomDomain", { domain_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-host-domains", host?.id] }),
  });

  if (domains.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-primary" />
        <p className="text-sm font-black text-white">Custom Domains</p>
      </div>
      {domains.map((d) => (
        <div key={d.id} className="rounded-xl border border-white/[0.08] bg-black/10 p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white">{d.normalized_domain}</p>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                <Pill tone={d.verification_status === "verified" ? "green" : d.verification_status === "under_review" ? "blue" : d.verification_status === "failed" ? "red" : "yellow"}>{d.verification_status}</Pill>
                <Pill tone={d.ssl_status === "active" ? "green" : d.ssl_status === "failed" ? "red" : "gray"}>SSL {d.ssl_status || "unknown"}</Pill>
                {d.active && <Pill tone="green">active</Pill>}
                {d.requires_admin_review && <Pill tone="yellow">review required</Pill>}
              </div>
            </div>
            <button onClick={() => verifyMutation.mutate(d.id)} disabled={verifyMutation.isPending} className="px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs font-bold flex items-center gap-1.5">
              {verifyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Recheck
            </button>
          </div>
          {(d.review_reason || d.failure_reason || d.notes) && (
            <div className="space-y-1 text-xs">
              {d.review_reason && <p className="text-yellow-300 flex gap-2"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />{d.review_reason}</p>}
              {d.failure_reason && <p className="text-red-300">Failure: {d.failure_reason}</p>}
              {d.notes && <p className="text-white/35">{d.notes}</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => updateMutation.mutate({ id: d.id, data: { verification_status: "verified", active: true, requires_admin_review: false, review_reason: "", failure_reason: "Approved by admin exception", verified_at: new Date().toISOString() } })} className="px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/25 text-xs font-bold flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" /> Approve exception</button>
            <button onClick={() => updateMutation.mutate({ id: d.id, data: { active: false, verification_status: "under_review", requires_admin_review: true, review_reason: "Marked under review by admin" } })} className="px-3 py-1.5 rounded-lg bg-yellow-500/15 text-yellow-400 border border-yellow-500/25 text-xs font-bold">Mark under review</button>
            <button onClick={() => updateMutation.mutate({ id: d.id, data: { active: false, verification_status: "inactive", failure_reason: "Deactivated by admin", redirect_to_canonical: true } })} className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/25 text-xs font-bold flex items-center gap-1.5"><XCircle className="h-3 w-3" /> Deactivate</button>
          </div>
        </div>
      ))}
    </div>
  );
}