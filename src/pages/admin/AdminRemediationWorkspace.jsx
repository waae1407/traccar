import React from "react";
import { useQuery } from "@tanstack/react-query";
import { loadManualRemediationWorkspaceData } from "@/lib/operational/manualRemediationWorkspaceEngine";
import RemediationSafetyBanner from "@/components/admin/remediation/RemediationSafetyBanner";
import ExecutionReadinessPanel from "@/components/admin/remediation/ExecutionReadinessPanel";
import RemediationCaseWorkspace from "@/components/admin/remediation/RemediationCaseWorkspace";
import RemediationBundlesPanel from "@/components/admin/remediation/RemediationBundlesPanel";

export default function AdminRemediationWorkspace() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-manual-remediation-workspace"], queryFn: loadManualRemediationWorkspaceData });

  if (isLoading) return <div className="p-6 text-white/60">Loading remediation workspace…</div>;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Controlled Manual Remediation · Staging only</p>
        <h1 className="text-3xl font-bold text-white mt-1">Remediation Workspace</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-4xl">Draft remediation cases, staged non-executable actions, approval-flow simulation, bundle previews, rollback simulation, and readiness scoring. No live financial data is changed here.</p>
      </div>
      <RemediationSafetyBanner banners={data?.safetyBanners || []} />
      <ExecutionReadinessPanel readiness={data?.executionReadiness} recommendation={data?.recommendation} />
      <RemediationBundlesPanel bundles={data?.bundles || []} />
      <RemediationCaseWorkspace cases={data?.cases || []} />
    </div>
  );
}