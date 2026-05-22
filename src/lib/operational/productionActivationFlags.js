const activeReadOnly = (rollbackPath) => ({
  status: "active",
  operationalMode: "live_governed_stabilization",
  rollbackPath,
  readOnlyEnforced: true,
  exportsCertified: true,
  confidenceLabelsRequired: true,
  governanceBannerRequired: true,
  dryRunIndicatorsRequired: true,
});

export const PRODUCTION_ACTIVATION_FLAGS = {
  AdminExpenses: activeReadOnly("/expenses"),
  AdminRecurringExpenses: activeReadOnly("/admin/expenses-preview"),
  PaymentReconciliationPreview: activeReadOnly("/payments"),
  FinancialControlCenter: activeReadOnly("/admin/payment-reconciliation-preview"),
  StabilizationDashboard: activeReadOnly("/admin/financial-control-center"),
  RemediationWorkspace: activeReadOnly("/admin/financial-control-center"),
  GovernanceDashboards: activeReadOnly("/admin/remediation-workspace"),
  ReadinessMatrix: activeReadOnly("/admin/remediation-workspace"),
  OperationalMonitoring: activeReadOnly("/admin/operations"),
  ReviewerWorkflows: activeReadOnly("/admin/financial-control-center"),
  TrustedRevenueReporting: activeReadOnly("/reports"),
  PayoutExposureReporting: activeReadOnly("/admin/payouts"),
  CertificationDashboards: activeReadOnly("/admin/remediation-workspace"),
  ReconciliationExports: activeReadOnly("/admin/payment-reconciliation-preview"),
  RemediationBundles: activeReadOnly("/admin/remediation-workspace"),
  RollbackPreviews: activeReadOnly("/admin/remediation-workspace"),
  DryRunSimulation: activeReadOnly("/admin/financial-control-center"),
  AdminPayoutsV2: {
    status: "disabled",
    rollbackPath: "/admin/payouts",
    readOnlyEnforced: true,
    exportsCertified: false,
    confidenceLabelsRequired: true,
    governanceBannerRequired: true,
    dryRunIndicatorsRequired: true,
  },
  AdminPnLV2: {
    status: "disabled",
    rollbackPath: "/admin/pnl",
    readOnlyEnforced: true,
    exportsCertified: false,
    confidenceLabelsRequired: true,
    governanceBannerRequired: true,
    dryRunIndicatorsRequired: true,
  },
};

export const FULL_OPERATIONAL_EXECUTION_LOCKS = [
  "payout_execution",
  "stripe_transfer_execution",
  "admin_payouts_v2_promotion",
  "admin_pnl_v2_promotion",
  "auto_remediation",
  "automatic_payout_creation",
  "automatic_booking_correction",
  "automatic_dispute_resolution",
  "destructive_financial_mutations",
];

export const STABILIZATION_PRIORITIES = [
  "reduce_unresolved_payment_exposure",
  "increase_trusted_revenue_percent",
  "reduce_payout_gaps",
  "validate_manual_backfill_payments",
  "improve_stripe_linkage_coverage",
  "validate_reviewer_workflows",
  "validate_export_parity",
  "validate_rollback_readiness",
];

export const PHASE_1_EXECUTION_LOCKS = FULL_OPERATIONAL_EXECUTION_LOCKS;