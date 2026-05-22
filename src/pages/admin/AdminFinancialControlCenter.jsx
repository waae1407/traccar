import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Lock } from "lucide-react";
import { loadFinancialControlCenterData } from "@/lib/operational/financialControlCenterEngine";
import { loadRemediationSimulationData } from "@/lib/operational/remediationSimulationEngine";
import { downloadCsv } from "@/lib/operational/sharedExportUtils";
import FinancialIntegrityDashboard from "@/components/admin/payment-reconciliation/FinancialIntegrityDashboard";
import PaymentReconciliationKpis from "@/components/admin/payment-reconciliation/PaymentReconciliationKpis";
import BookingStateReviewPanel from "@/components/admin/payment-reconciliation/BookingStateReviewPanel";
import HistoricalPayoutBackfillPreview from "@/components/admin/payment-reconciliation/HistoricalPayoutBackfillPreview";
import FinancialExceptionRegistry from "@/components/admin/payment-reconciliation/FinancialExceptionRegistry";
import FinancialAuditTimeline from "@/components/admin/payment-reconciliation/FinancialAuditTimeline";
import RevenueSeparationPanel from "@/components/admin/financial-control/RevenueSeparationPanel";
import ConfidenceDistributionPanel from "@/components/admin/financial-control/ConfidenceDistributionPanel";
import PayoutReadinessPanel from "@/components/admin/financial-control/PayoutReadinessPanel";
import IntegrityScorePanel from "@/components/admin/financial-control/IntegrityScorePanel";
import PromotionReadinessTracker from "@/components/admin/financial-control/PromotionReadinessTracker";
import RemediationPlanningPanel from "@/components/admin/financial-control/RemediationPlanningPanel";
import RemediationSimulationTools from "@/components/admin/financial-control/RemediationSimulationTools";
import RemediationQueuePanel from "@/components/admin/financial-control/RemediationQueuePanel";
import ExposureForecastPanel from "@/components/admin/financial-control/ExposureForecastPanel";
import SimulationAuditPanel from "@/components/admin/financial-control/SimulationAuditPanel";
import GlobalGovernanceBanner from "@/components/admin/governance/GlobalGovernanceBanner";
import DailyStabilizationOperationsDashboard from "@/components/admin/stabilization/DailyStabilizationOperationsDashboard";
import ReviewerTaskQueues from "@/components/admin/stabilization/ReviewerTaskQueues";
import TrustedDataProgressTracker from "@/components/admin/stabilization/TrustedDataProgressTracker";
import ControlledActivationChecklist from "@/components/admin/stabilization/ControlledActivationChecklist";
import ReviewerSignoffSimulation from "@/components/admin/stabilization/ReviewerSignoffSimulation";
import ProductionReadinessHeatmap from "@/components/admin/stabilization/ProductionReadinessHeatmap";
import StabilizationExportPanel from "@/components/admin/stabilization/StabilizationExportPanel";
import ProductionActivationStatus from "@/components/admin/stabilization/ProductionActivationStatus";
import { PRODUCTION_ACTIVATION_FLAGS } from "@/lib/operational/productionActivationFlags";
import OperationalReviewerActions from "@/components/admin/stabilization/OperationalReviewerActions";

export default function AdminFinancialControlCenter() {
  const { data, isLoading } = useQuery({ queryKey: ["admin-financial-control-center"], queryFn: loadFinancialControlCenterData });
  const { data: simulationData, isLoading: isLoadingSimulation } = useQuery({ queryKey: ["admin-remediation-simulation"], queryFn: loadRemediationSimulationData });

  if (isLoading || isLoadingSimulation) return <div className="p-6 text-white/60">Loading financial control center…</div>;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-primary font-bold">Convergence Sprint 1 · Read-only</p>
          <h1 className="text-3xl font-bold text-white mt-1">Unified Financial Control Center</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-4xl">Central review workspace for reconciliation, confidence, payout readiness, exceptions, audit history, remediation planning, simulation previews, promotion readiness, and standardized exports. No Stripe, payout, booking, or legacy-row mutations are available here.</p>
        </div>
        <button onClick={() => downloadCsv(data?.standardizedExportRows || [], `financial-control-center-${new Date().toISOString().slice(0, 10)}.csv`)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white/70 hover:bg-white/10">
          <Download className="h-4 w-4" /> Export standardized CSV
        </button>
      </div>

      <GlobalGovernanceBanner />
      <ProductionActivationStatus flag={PRODUCTION_ACTIVATION_FLAGS.FinancialControlCenter} title="Financial Control Center stabilization operations" />
      <ProductionActivationStatus flag={PRODUCTION_ACTIVATION_FLAGS.StabilizationDashboard} title="Stabilization Dashboard operations" />
      <ProductionActivationStatus flag={PRODUCTION_ACTIVATION_FLAGS.ReviewerWorkflows} title="Reviewer workflow validation" />
      <OperationalReviewerActions systemArea="financial_control_center" />

      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 flex items-start gap-3">
        <Lock className="h-5 w-5 text-primary mt-0.5" />
        <div>
          <p className="font-bold text-white">Safety lock active</p>
          <p className="text-sm text-white/55">Read-only, simulation only, rollback-safe, non-executable, no Stripe mutation, no payout execution, no booking mutation, no automatic cleanup.</p>
        </div>
      </div>

      <IntegrityScorePanel integrity={data?.financialIntegrityScore} recommendation={simulationData?.recommendation || data?.convergenceRecommendation} />
      <DailyStabilizationOperationsDashboard metrics={data?.dailyOperationsMetrics} />
      <ReviewerTaskQueues queues={data?.reviewerTaskQueues || []} />
      <TrustedDataProgressTracker progress={data?.trustedDataProgress} />
      <ControlledActivationChecklist checklists={data?.activationChecklists || []} />
      <ReviewerSignoffSimulation signoffs={data?.reviewerSignoffSimulation || []} />
      <ProductionReadinessHeatmap heatmap={data?.productionReadinessHeatmap || []} />
      <StabilizationExportPanel exports={data?.stabilizationExports || {}} />
      <RemediationSimulationTools scenarios={simulationData?.scenarios || []} readinessScore={simulationData?.remediationReadinessScore || 0} recommendation={simulationData?.recommendation} />
      <ExposureForecastPanel forecast={simulationData?.exposureForecast} conflicts={simulationData?.conflictCategories || []} />
      <RemediationQueuePanel queue={simulationData?.remediationQueue} />
      <RevenueSeparationPanel revenue={data?.revenueSeparation} />
      <FinancialIntegrityDashboard summary={data?.summary} />
      <PaymentReconciliationKpis summary={data?.summary} />
      <PayoutReadinessPanel metrics={data?.payoutReadinessMetrics} />
      <ConfidenceDistributionPanel distribution={data?.confidenceDistribution} records={data?.unifiedConfidenceRecords || []} />
      <FinancialExceptionRegistry exceptions={data?.exceptionRegistry || []} />
      <BookingStateReviewPanel rows={data?.issueRows || []} />
      <HistoricalPayoutBackfillPreview rows={data?.payoutBackfillCandidates || []} />
      <RemediationPlanningPanel actions={data?.recommendedCleanupActions || []} legacyRows={data?.legacyClassifications || []} />
      <PromotionReadinessTracker items={simulationData?.expandedPromotionReadiness || data?.promotionReadiness || []} />
      <SimulationAuditPanel audit={simulationData?.simulationAudit || []} simulatedBy={simulationData?.simulatedBy} generatedAt={simulationData?.generatedAt} />
      <FinancialAuditTimeline events={data?.auditTimeline || []} />
    </div>
  );
}