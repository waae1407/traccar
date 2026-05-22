export const PRODUCTION_ACTIVATION_FLAGS = {
  AdminExpenses: {
    status: "active",
    rollbackPath: "/expenses",
    readOnlyEnforced: true,
    exportsCertified: true,
    confidenceLabelsRequired: true,
  },
  AdminRecurringExpenses: {
    status: "active",
    rollbackPath: "/admin/expenses-preview",
    readOnlyEnforced: true,
    exportsCertified: true,
    confidenceLabelsRequired: true,
  },
  PaymentReconciliationPreview: {
    status: "active",
    rollbackPath: "/payments",
    readOnlyEnforced: true,
    exportsCertified: true,
    confidenceLabelsRequired: true,
  },
  FinancialControlCenter: {
    status: "active",
    rollbackPath: "/admin/payment-reconciliation-preview",
    readOnlyEnforced: true,
    exportsCertified: true,
    confidenceLabelsRequired: true,
  },
  StabilizationDashboard: {
    status: "active",
    rollbackPath: "/admin/financial-control-center",
    readOnlyEnforced: true,
    exportsCertified: true,
    confidenceLabelsRequired: true,
  },
  AdminPayoutsV2: {
    status: "disabled",
    rollbackPath: "/admin/payouts",
    readOnlyEnforced: true,
    exportsCertified: false,
    confidenceLabelsRequired: true,
  },
  AdminPnLV2: {
    status: "disabled",
    rollbackPath: "/admin/pnl",
    readOnlyEnforced: true,
    exportsCertified: false,
    confidenceLabelsRequired: true,
  },
};

export const PHASE_1_EXECUTION_LOCKS = [
  "automated_payout_execution",
  "stripe_transfer_execution",
  "host_payout_auto_creation",
  "remediation_execution",
  "automatic_corrections",
  "dispute_auto_resolution",
  "admin_payouts_v2_promotion",
  "admin_pnl_v2_promotion",
];