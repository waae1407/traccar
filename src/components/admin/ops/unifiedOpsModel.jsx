const OPEN_STATUSES = ["new", "notified", "acknowledged", "in_progress", "under_review", "waiting_on_host", "waiting_on_customer", "waiting_on_installer", "retry_scheduled", "escalated", "open", "pending", "pending_review", "failed", "overdue", "expired", "payout_held", "evidence_requested", "chargeback"];
const CLOSED_STATUSES = ["resolved", "dismissed", "closed", "completed", "approved", "valid", "published"];

export const DOMAINS = ["all", "payments", "telematics", "fleet", "hosts", "customers", "installers", "dealer_network", "reputation", "compliance", "communications"];
export const STREAM_TABS = ["payments", "telematics", "fleet", "hosts", "customers", "installers", "dealer_network", "reputation", "compliance"];

export function severityRank(severity = "info") {
  return { critical: 0, high: 1, warning: 2, medium: 2, low: 3, info: 4 }[severity] ?? 4;
}

export function normalizeSeverity(severity) {
  if (severity === "warning") return "medium";
  return severity || "info";
}

function dateOf(record) {
  return record?.created_date || record?.updated_date || record?.created_at || record?.timestamp || record?.last_message_at || record?.reviewed_at || record?.date || new Date().toISOString();
}

function isOpen(status) {
  return !CLOSED_STATUSES.includes(status) && OPEN_STATUSES.includes(status || "new");
}

function baseItem({ id, entityName, kind, domain, title, message, severity = "info", status = "new", raw, actionUrl, sourceType, sourceId, hostId, customerEmail, vehicleId, bookingId, provider, assignedRole, assignedTo, threadId, dedupeKey }) {
  return {
    id, entityName, kind, domain, title, message, severity: normalizeSeverity(severity), originalSeverity: severity, status,
    raw, actionUrl, sourceType, sourceId, hostId, customerEmail, vehicleId, bookingId, provider, assignedRole, assignedTo, threadId,
    dedupeKey: dedupeKey || `${entityName}:${id}`, createdAt: dateOf(raw), repeatCount: raw?.repeat_count || 1,
  };
}

export function buildOperationsData(data) {
  const needsAction = [];
  const notifications = [];
  const events = [];
  const audit = [];

  (data.paymentAlerts || []).forEach(a => {
    const item = baseItem({
      id: a.id, entityName: "PaymentOperationalAlert", kind: "Payment Alert", domain: "payments",
      title: a.title || "Payment operational alert", message: a.message || a.recommended_action || "Payment issue requires review.",
      severity: a.severity, status: a.status || "new", raw: a, actionUrl: a.action_url || "/admin/payment-alerts",
      sourceType: a.source_entity_type || a.related_entity_type || "PaymentOperationalAlert", sourceId: a.source_entity_id || a.related_entity_id || a.id,
      hostId: a.host_id, customerEmail: a.renter_email, vehicleId: a.vehicle_id, bookingId: a.booking_id,
      assignedRole: a.assigned_role, assignedTo: a.assigned_to || a.admin_assigned_to, threadId: a.communication_thread_id,
      dedupeKey: `${a.alert_type}:${a.booking_id || a.related_entity_id || a.id}`,
    });
    if (isOpen(a.status)) needsAction.push(item);
    events.push(item);
  });

  (data.operationalAlerts || []).forEach(a => {
    const item = baseItem({
      id: a.id, entityName: "OperationalAlert", kind: "Operational Alert", domain: a.domain || "telematics",
      title: a.title || a.alert_type, message: a.message || a.recommended_action || "Operational issue requires review.",
      severity: a.severity, status: a.status || "new", raw: a, actionUrl: a.action_url || "/admin/telematics-operations",
      sourceType: a.source_entity_type || "OperationalAlert", sourceId: a.source_entity_id || a.id,
      hostId: a.host_id, vehicleId: a.vehicle_id, provider: a.provider_key, assignedRole: a.assigned_role, assignedTo: a.assigned_to,
      threadId: a.communication_thread_id, dedupeKey: a.dedupe_key || `${a.alert_type}:${a.telematics_device_id || a.vehicle_id || a.id}`,
    });
    if (isOpen(a.status)) needsAction.push(item);
    events.push(item);
  });

  (data.commands || []).filter(c => ["failed", "expired", "blocked"].includes(c.status) || ["failed", "expired", "blocked"].includes(c.queue_status)).forEach(c => {
    needsAction.push(baseItem({ id: c.id, entityName: "TelematicsCommand", kind: "Failed Command", domain: "telematics", title: `${c.command_type || "Command"} ${c.queue_status || c.status}`, message: c.failure_reason || "Telematics command needs review.", severity: "high", status: c.queue_status || c.status, raw: c, actionUrl: "/admin/telematics-operations", sourceType: "TelematicsCommand", sourceId: c.id, hostId: c.host_id, vehicleId: c.vehicle_id, provider: c.provider_key, dedupeKey: `command:${c.telematics_device_id}:${c.command_type}` }));
  });

  (data.installRecords || []).filter(r => ["failed", "unmatched_vin"].includes(r.install_status) || r.qa_status === "rejected").forEach(r => {
    needsAction.push(baseItem({ id: r.id, entityName: "TelematicsInstallRecord", kind: "Install Exception", domain: "installers", title: r.install_status === "unmatched_vin" ? "VIN mismatch install" : "Installation exception", message: r.installation_notes || "Installer/telematics install requires review.", severity: "high", status: r.install_status, raw: r, actionUrl: "/admin/telematics-rollout", sourceType: "TelematicsInstallRecord", sourceId: r.id, hostId: r.host_id, vehicleId: r.vehicle_id, provider: r.provider_key, assignedTo: r.assigned_installer_email, assignedRole: "installer", dedupeKey: `install:${r.telematics_device_id || r.id}` }));
  });

  (data.compliance || []).filter(c => ["expired", "pending_review"].includes(c.status)).forEach(c => {
    needsAction.push(baseItem({ id: c.id, entityName: "HostVehicleCompliance", kind: "Compliance Exception", domain: "compliance", title: `${c.doc_type || "Document"} ${c.status}`, message: c.notes || `${c.vehicle_name || "Vehicle"} compliance requires review.`, severity: c.status === "expired" ? "high" : "medium", status: c.status, raw: c, actionUrl: "/admin/compliance-queue", sourceType: "HostVehicleCompliance", sourceId: c.id, hostId: c.host_id, vehicleId: c.vehicle_id, dedupeKey: `compliance:${c.vehicle_id}:${c.doc_type}` }));
  });

  (data.disputes || []).filter(d => isOpen(d.status)).forEach(d => {
    needsAction.push(baseItem({ id: d.id, entityName: "Dispute", kind: "Dispute", domain: "customers", title: d.dispute_type || "Open dispute", message: d.description || "Dispute needs admin review.", severity: d.status === "chargeback" ? "critical" : "high", status: d.status, raw: d, actionUrl: "/admin/disputes", sourceType: "Dispute", sourceId: d.id, hostId: d.host_id, customerEmail: d.customer_email, vehicleId: d.vehicle_id, bookingId: d.booking_request_id, assignedTo: d.assigned_admin_id, assignedRole: "admin", dedupeKey: `dispute:${d.booking_request_id || d.id}` }));
  });

  (data.reviewQueue || []).filter(r => ["pending", "flagged"].includes(r.moderation_status)).forEach(r => {
    needsAction.push(baseItem({ id: r.id, entityName: "ReviewModerationQueue", kind: "Review Moderation", domain: "reputation", title: "Review moderation pending", message: r.flag_reason || "Review needs moderation.", severity: r.moderation_status === "flagged" ? "high" : "medium", status: r.moderation_status, raw: r, actionUrl: "/admin/review-moderation", sourceType: "ReviewModerationQueue", sourceId: r.id, hostId: r.host_id, vehicleId: r.vehicle_id, bookingId: r.booking_request_id, dedupeKey: `review:${r.review_id}` }));
  });

  (data.bookings || []).filter(b => b.payment_status === "failed" || ["payment_due", "grace_period", "suspended", "cancellation_requested", "return_pending_host_review"].includes(b.booking_status) || (b.booking_status === "active" && b.end_date && new Date(b.end_date) < new Date())).forEach(b => {
    needsAction.push(baseItem({ id: b.id, entityName: "BookingRequest", kind: "Booking Exception", domain: "customers", title: b.booking_status?.replace(/_/g, " ") || "Booking exception", message: `${b.customer_full_name || b.user_email || "Customer"} · ${b.vehicle_name || "Vehicle"}`, severity: b.booking_status === "suspended" || b.payment_status === "failed" ? "critical" : "medium", status: b.booking_status, raw: b, actionUrl: "/bookings-admin", sourceType: "BookingRequest", sourceId: b.id, hostId: b.host_id, customerEmail: b.user_email, vehicleId: b.vehicle_id, bookingId: b.id, assignedTo: b.assigned_admin_user_id, assignedRole: "admin", dedupeKey: `booking:${b.id}:${b.booking_status}:${b.payment_status}` }));
  });

  (data.hostMaintenance || []).filter(m => m.status === "overdue" || m.service_cadence_status === "overdue").forEach(m => {
    needsAction.push(baseItem({ id: m.id, entityName: "HostMaintenanceLog", kind: "Maintenance Exception", domain: "fleet", title: "Maintenance overdue", message: `${m.vehicle_name || "Vehicle"} service is overdue.`, severity: "medium", status: m.status || m.service_cadence_status, raw: m, actionUrl: "/admin/maintenance", sourceType: "HostMaintenanceLog", sourceId: m.id, hostId: m.host_id, vehicleId: m.vehicle_id, dedupeKey: `maintenance:${m.vehicle_id}:${m.service_type}` }));
  });

  (data.hosts || []).filter(h => ["not_started", "docs_requested", "failed"].includes(h.verification_status) || h.status === "pending").forEach(h => {
    needsAction.push(baseItem({ id: h.id, entityName: "Host", kind: "Host Compliance", domain: "hosts", title: "Host documents need review", message: h.business_name || h.full_name || h.email, severity: "medium", status: h.verification_status || h.status, raw: h, actionUrl: "/admin/hosts", sourceType: "Host", sourceId: h.id, hostId: h.id, assignedRole: "admin", dedupeKey: `host_docs:${h.id}` }));
  });

  (data.dealerEvents || []).filter(e => /failed|past_due|suspended|issue|under_review/i.test(`${e.event_type} ${e.to_status} ${e.event_summary}`)).forEach(e => {
    needsAction.push(baseItem({ id: e.id, entityName: "DealerNetworkEventLog", kind: "Dealer Network Issue", domain: "dealer_network", title: e.event_type || "Dealer network issue", message: e.event_summary, severity: "medium", status: e.to_status || "new", raw: e, actionUrl: "/admin/dealer-network", sourceType: "DealerNetworkEventLog", sourceId: e.id, hostId: e.host_id, dedupeKey: `dealer:${e.related_entity_type}:${e.related_entity_id}:${e.event_type}` }));
  });

  (data.notifications || []).forEach(n => {
    notifications.push(baseItem({ id: n.id, entityName: "Notification", kind: "Notification", domain: notificationDomain(n), title: n.title, message: n.message || n.body, severity: n.severity || (n.type === "alert" ? "medium" : "info"), status: n.read_status ? "read" : "unread", raw: n, actionUrl: n.action_url || n.action_link, sourceType: n.source_entity_type || "Notification", sourceId: n.source_entity_id || n.id, customerEmail: n.recipient_email || n.user_email, bookingId: n.booking_request_id, dedupeKey: `notification:${n.id}` }));
  });

  (data.activities || []).forEach(a => {
    const item = baseItem({ id: a.id, entityName: "ActivityEvent", kind: "Activity", domain: domainFromEvent(a.event_type), title: a.event_title || a.summary || a.event_type, message: a.event_description || a.summary || "Business activity", severity: a.event_status === "error" ? "high" : a.event_status === "warning" ? "medium" : "info", status: a.event_status || "success", raw: a, actionUrl: "/admin/audit-log", sourceType: a.target_entity || "ActivityEvent", sourceId: a.target_id || a.id, hostId: a.host_id, customerEmail: a.user_email, vehicleId: a.vehicle_id, bookingId: a.booking_id || a.booking_request_id, assignedRole: a.actor_role, dedupeKey: a.dedupe_key || `activity:${a.id}` });
    events.push(item);
    if (["admin", "system", "automation", "stripe"].includes(a.actor_role) || ["admin_panel", "automation", "webhook", "system"].includes(a.source)) audit.push(item);
  });

  (data.telematicsEvents || []).forEach(e => events.push(baseItem({ id: e.id, entityName: "TelematicsEvent", kind: "Telematics Event", domain: "telematics", title: e.event_type, message: e.provider_key || "Telematics event", severity: /failed|offline|stale/i.test(e.event_type) ? "medium" : "info", status: "event", raw: e, actionUrl: "/admin/telematics-operations", sourceType: "TelematicsEvent", sourceId: e.id, vehicleId: e.vehicle_id, provider: e.provider_key, dedupeKey: `telematics_event:${e.event_type}:${e.telematics_device_id}` })));
  (data.dealerEvents || []).forEach(e => events.push(baseItem({ id: e.id, entityName: "DealerNetworkEventLog", kind: "Dealer Event", domain: "dealer_network", title: e.event_type, message: e.event_summary, severity: "info", status: e.to_status || "event", raw: e, actionUrl: "/admin/dealer-network", sourceType: "DealerNetworkEventLog", sourceId: e.id, hostId: e.host_id, dedupeKey: `dealer_event:${e.id}` })));
  (data.reputationEvents || []).forEach(e => events.push(baseItem({ id: e.id, entityName: "ReputationEventLog", kind: "Reputation Event", domain: "reputation", title: e.event_type, message: e.reason, severity: e.score_impact < 0 ? "medium" : "info", status: "event", raw: e, actionUrl: "/admin/reputation-validation", sourceType: "ReputationEventLog", sourceId: e.id, hostId: e.host_id, vehicleId: e.vehicle_id, bookingId: e.booking_request_id, dedupeKey: `reputation:${e.id}` })));

  return { needsAction: dedupeItems(needsAction), notifications, events, audit };
}

function notificationDomain(notification) {
  if (notification.domain) return notification.domain;
  if (notification.type === "payment") return "payments";
  if (notification.type === "alert" || notification.type === "security") return "system";
  if (notification.type === "communication") return "communications";
  return notification.type || "system";
}

function domainFromEvent(type = "") {
  if (type.startsWith("payment.")) return "payments";
  if (type.startsWith("gps.") || type.startsWith("telematics.")) return "telematics";
  if (type.startsWith("vehicle.") || type.startsWith("maintenance.")) return "fleet";
  if (type.startsWith("host.")) return "hosts";
  if (type.startsWith("compliance.")) return "compliance";
  if (type.startsWith("dispute.") || type.startsWith("booking.")) return "customers";
  if (type.startsWith("payout.")) return "payments";
  return "system";
}

function dedupeItems(items) {
  const grouped = new Map();
  items.forEach(item => {
    const key = item.dedupeKey;
    const existing = grouped.get(key);
    if (!existing) grouped.set(key, item);
    else {
      const newer = new Date(item.createdAt) > new Date(existing.createdAt) ? item : existing;
      grouped.set(key, { ...newer, repeatCount: (existing.repeatCount || 1) + (item.repeatCount || 1) });
    }
  });
  return [...grouped.values()].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || new Date(b.createdAt) - new Date(a.createdAt));
}

export function applyFilters(items, filters, roleScope, allowedHostIds, userEmail) {
  return items.filter(item => {
    if (roleScope === "host" && item.hostId && !allowedHostIds.has(item.hostId)) return false;
    if (roleScope === "customer" && item.customerEmail && item.customerEmail !== userEmail) return false;
    if (roleScope === "installer" && item.assignedRole && item.assignedRole !== "installer") return false;
    if (filters.domain !== "all" && item.domain !== filters.domain) return false;
    if (filters.severity !== "all" && item.severity !== filters.severity) return false;
    if (filters.status && !item.status?.includes(filters.status)) return false;
    if (filters.assignedRole !== "all" && item.assignedRole !== filters.assignedRole) return false;
    if (filters.sourceType && !item.sourceType?.toLowerCase().includes(filters.sourceType.toLowerCase())) return false;
    if (filters.host && item.hostId !== filters.host) return false;
    if (filters.customer && !item.customerEmail?.toLowerCase().includes(filters.customer.toLowerCase())) return false;
    if (filters.vehicle && item.vehicleId !== filters.vehicle) return false;
    if (filters.booking && item.bookingId !== filters.booking) return false;
    if (filters.provider && item.provider !== filters.provider) return false;
    if (filters.alertType && !`${item.raw?.alert_type || item.kind}`.toLowerCase().includes(filters.alertType.toLowerCase())) return false;
    if (filters.search && !`${item.title} ${item.message} ${item.kind} ${item.domain}`.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.from && new Date(item.createdAt) < new Date(filters.from)) return false;
    if (filters.to && new Date(item.createdAt) > new Date(`${filters.to}T23:59:59`)) return false;
    return true;
  });
}