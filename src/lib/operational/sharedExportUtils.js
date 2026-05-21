export function rowsToCsv(rows = []) {
  return rows
    .map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function downloadCsv(rows = [], filename = "export.csv") {
  const csv = rowsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildExpenseExportRows(expenses = []) {
  return [
    ["Host", "Vehicle", "Type", "Amount", "Date", "Description", "Tax Deductible", "Reimbursable", "Recurring"],
    ...expenses.map((expense) => [
      expense.host_name || "",
      expense.vehicle_name || "Fleet",
      expense.expense_type || expense.category || "",
      expense.amount || 0,
      expense.date || "",
      expense.description || "",
      expense.tax_deductible ? "Yes" : "No",
      expense.reimbursable ? "Yes" : "No",
      expense.recurring ? "Yes" : "No",
    ]),
  ];
}

export function buildMaintenanceExportRows(records = []) {
  return [
    ["Source", "Host", "Vehicle", "Service Type", "Date", "Cost", "Status", "Next Date", "Next Mileage", "Notes"],
    ...records.map((record) => [
      record.source || "",
      record.host_name || "",
      record.vehicle_name || "",
      record.service_type || "",
      record.date || "",
      record.cost || 0,
      record.computed_status || record.status || "",
      record.next_service_date || "",
      record.next_service_mileage || "",
      record.notes || "",
    ]),
  ];
}

export function buildRecurringExpenseExportRows(records = []) {
  return [
    ["Host", "Vehicle", "Category", "Vendor", "Amount", "Frequency", "Monthly Projection", "Next Due", "Due Status", "Status"],
    ...records.map((item) => [
      item.host_name || "",
      item.vehicle_name || "Fleet",
      item.category || "",
      item.vendor || "",
      item.amount || 0,
      item.frequency || "",
      item.monthly_amount || 0,
      item.next_due_date || "",
      item.due_status || "",
      item.status || "",
    ]),
  ];
}

export function buildPayoutExportRows(payouts = []) {
  return [
    ["Payout ID", "Synthesized", "Host", "Booking", "Customer", "Vehicle", "Gross", "Platform Fee", "Stripe Fee", "Net", "Status", "Date"],
    ...payouts.map((payout) => [
      payout.id || "",
      payout._synthesized ? "Yes" : "No",
      payout.host_name || payout.host_email || "",
      payout.booking_request_id || "",
      payout.customer_name || payout.customer_email || "",
      payout.vehicle_name || "",
      payout.gross_booking_amount || payout.gross_collected || 0,
      payout.uride_platform_fee_amount || payout.platform_fee || 0,
      payout.stripe_fee_amount || 0,
      payout.net_host_payout || payout.net_payout || 0,
      payout.status || "",
      payout.payout_date || payout.created_date || "",
    ]),
  ];
}