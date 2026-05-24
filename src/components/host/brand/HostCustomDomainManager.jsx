import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Globe, Loader2, Copy, ShieldCheck, AlertTriangle, RefreshCw } from "lucide-react";

const DNS_TARGET = "base44.onrender.com";
const inputClass = "w-full px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 text-sm transition-all";

function normalizeDomain(value) {
  return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^\/+/, "").split("/")[0].split(":")[0].replace(/\.$/, "");
}

function domainType(domain) {
  if (domain.startsWith("www.")) return "www";
  return domain.split(".").length === 2 ? "apex" : "subdomain";
}

function token() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function CopyButton({ value }) {
  return (
    <button type="button" onClick={() => navigator.clipboard.writeText(value || "")} className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:text-pink-600">
      <Copy className="h-3.5 w-3.5" />
    </button>
  );
}

function StatusPill({ status }) {
  const colors = {
    verified: "bg-emerald-100 text-emerald-700 border-emerald-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    inactive: "bg-gray-100 text-gray-600 border-gray-200",
    under_review: "bg-blue-100 text-blue-700 border-blue-200",
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    unknown: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${colors[status] || colors.unknown}`}>{String(status || "unknown").replace(/_/g, " ")}</span>;
}

export default function HostCustomDomainManager({ host, brand }) {
  const qc = useQueryClient();
  const [domainInput, setDomainInput] = useState("");

  const { data: domains = [] } = useQuery({
    queryKey: ["host-custom-domains", host?.id],
    queryFn: () => base44.entities.HostCustomDomain.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const createMutation = useMutation({
    mutationFn: (domain) => {
      const normalized = normalizeDomain(domain);
      const verificationToken = token();
      return base44.entities.HostCustomDomain.create({
        host_id: host.id,
        domain,
        normalized_domain: normalized,
        domain_type: domainType(normalized),
        business_slug: brand?.business_slug,
        verification_status: "pending",
        ssl_status: "unknown",
        active: false,
        dns_target: DNS_TARGET,
        verification_token: verificationToken,
        txt_record_name: `_uride.${normalized}`,
        txt_record_value: `uride-verification=${verificationToken}`,
        cname_record_name: normalized,
        cname_record_value: DNS_TARGET,
        created_by_host_email: host.email,
        connected_at: new Date().toISOString(),
        redirect_to_canonical: true,
      });
    },
    onSuccess: () => {
      setDomainInput("");
      qc.invalidateQueries({ queryKey: ["host-custom-domains", host?.id] });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: (id) => base44.functions.invoke("verifyHostCustomDomain", { domain_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-custom-domains", host?.id] }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => base44.entities.HostCustomDomain.update(id, { active: false, verification_status: "inactive", failure_reason: "Deactivated by host" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-custom-domains", host?.id] }),
  });

  const addDomain = () => {
    const normalized = normalizeDomain(domainInput);
    if (!normalized || !brand?.business_slug) return;
    createMutation.mutate(normalized);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-pink-50">
          <Globe className="h-5 w-5 text-pink-500" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">Custom Domain</p>
          <p className="text-xs text-gray-500 mt-1">Connect a branded storefront domain. Checkout, login, payments, contracts, and Stripe remain on uRide for safety.</p>
        </div>
      </div>

      <div className="flex gap-2">
        <input className={inputClass} value={domainInput} onChange={(e) => setDomainInput(e.target.value)} placeholder="www.yourbrand.com" />
        <button onClick={addDomain} disabled={createMutation.isPending || !domainInput.trim() || !brand?.business_slug} className="px-4 rounded-2xl font-bold text-white text-sm disabled:opacity-40" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
        </button>
      </div>

      {domains.length === 0 && <p className="text-xs text-gray-400">Use a www domain for fastest setup, like www.eliteridesla.com.</p>}

      <div className="space-y-3">
        {domains.map((d) => (
          <div key={d.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-gray-900 text-sm">{d.normalized_domain}</p>
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  <StatusPill status={d.verification_status} />
                  <StatusPill status={d.ssl_status} />
                  {d.active && <StatusPill status="active" />}
                </div>
              </div>
              <button onClick={() => verifyMutation.mutate(d.id)} disabled={verifyMutation.isPending} className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 flex items-center gap-1.5">
                {verifyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Verify
              </button>
            </div>

            <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-[72px_1fr_32px] items-center gap-2 px-3 py-2 border-b border-gray-100">
                <span className="text-[10px] font-black text-gray-400">TXT</span>
                <span className="text-[11px] font-mono text-gray-700 truncate">{d.txt_record_name} = {d.txt_record_value}</span>
                <CopyButton value={d.txt_record_value} />
              </div>
              {d.domain_type !== "apex" && (
                <div className="grid grid-cols-[72px_1fr_32px] items-center gap-2 px-3 py-2">
                  <span className="text-[10px] font-black text-gray-400">CNAME</span>
                  <span className="text-[11px] font-mono text-gray-700 truncate">{d.cname_record_name} → {d.cname_record_value}</span>
                  <CopyButton value={d.cname_record_value} />
                </div>
              )}
            </div>

            {d.verification_status === "verified" ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" /> Verified storefront alias. Checkout redirects to uRide.</div>
            ) : d.failure_reason ? (
              <div className="flex items-start gap-2 text-xs font-semibold text-red-600"><AlertTriangle className="h-4 w-4 flex-shrink-0" /> {d.failure_reason}</div>
            ) : null}

            {d.active && (
              <button onClick={() => deactivateMutation.mutate(d.id)} className="text-xs font-bold text-red-500 hover:text-red-700">Deactivate domain</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}