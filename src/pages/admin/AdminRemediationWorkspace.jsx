import React from "react";
import { useQuery } from "@tanstack/react-query";
import { loadDryRunCertificationData } from "@/lib/operational/dryRunCertificationEngine";
import RemediationSafetyBanner from "@/components/admin/remediation/RemediationSafetyBanner";
import ExecutionReadinessPanel from "@/components/admin/remediation/ExecutionReadinessPanel";
import RemediationCaseWorkspace from "@/components/admin/remediation/RemediationCaseWorkspace";
import RemediationBundlesPanel from "@/components/admin/remediation/RemediationBundlesPanel";
import GlobalGovernanceBanner from "@/components/admin/governance/GlobalGovernanceBanner";
import GovernanceScorePanel from "@/components/admin/governance/GovernanceScorePanel";
import ReadinessMatrixPanel from "@/components/admin/governance/ReadinessMatrixPanel";
import ExposureReportingPanel from "@/components/admin/governance/ExposureReportingPanel";
import RollbackGovernancePanel from "@/components/admin/governance/RollbackGovernancePanel";
import ExecutionGatePanel from "@/components/admin/governance/ExecutionGatePanel";
import ImmutableAuditPreparationPanel from "@/components/admin/governance/ImmutableAuditPreparationPanel";
import ExportGovernancePanel from "@/components/admin/governance/ExportGovernancePanel";
import FinalBlockersPanel from "@/components/admin/governance/FinalBlockersPanel";
import FinalCertificationDashboard from "@/components/admin/governance/FinalCertificationDashboard";
import DryRunValidationPanel from "@/components/admin/governance/DryRunValidationPanel";

export default function AdminRemediationWorkspace() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-dry-run-certification"], queryFn: loadDryRunCertificationData });

  if (isLoading) return <div className="p-6 text-white/60">Loading remediation workspace…</div>;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div>
        <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Controlled Manual Remediation · Staging only</p>
        <h1 className="text-3xl font-bold text-white mt-1">Remediation Workspace</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-4xl">Draft remediation cases, staged non-executable actions, approval-flow simulation, bundle previews, rollback simulation, and readiness scoring. No live financial data is changed here.</p>
      </div>
      <GlobalGovernanceBanner />
      <RemediationSafetyBanner banners={data?.workspace?.safetyBanners || []} />
      <GovernanceScorePanel governance={data?.governance} />
      <FinalCertificationDashboard certification={data?.dryRunCertification} exposure={data?.exposure} governance={data?.governance} />
      <DryRunValidationPanel certification={data?.dryRunCertification} />
      <ReadinessMatrixPanel matrix={data?.readinessMatrix || []} />
      <ExposureReportingPanel exposure={data?.exposure} escalations={data?.escalationSummary || []} />
      <ExecutionGatePanel gates={data?.executionGates || []} />
      <ExecutionReadinessPanel readiness={data?.workspace?.executionReadiness} recommendation={data?.recommendation} />
      <RollbackGovernancePanel rollback={data?.rollbackGovernance || []} audit={data?.immutableAuditReadiness || []} safeguards={data?.executionSafeguards || []} />
      <ImmutableAuditPreparationPanel snapshots={data?.immutableAuditReadiness || []} />
      <ExportGovernancePanel standard={data?.exportStandard || []} authoritativeExportsBlocked={data?.authoritativeExportsBlocked} />
      <FinalBlockersPanel blockers={data?.finalBlockers || []} recommendation={data?.recommendation} />
      <RemediationBundlesPanel bundles={data?.workspace?.bundles || []} />
      <RemediationCaseWorkspace cases={data?.workspace?.cases || []} />
    </div>
  );
}