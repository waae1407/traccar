import React, { useState } from "react";
import { Bell, Shield, Lock, AlertTriangle, Globe, FileText, Wrench } from "lucide-react";
import OpsShortcutTab from "@/components/admin/ops/OpsShortcutTab";

// Operational Alerts remains canonical here; other workflows stay standalone and are summarized with shortcuts.
import AdminOperationalAlerts from "@/pages/admin/AdminOperationalAlerts";
import PaymentOperationalAlertPanel from "@/components/payments/PaymentOperationalAlertPanel";

// New focused tab components
import PayoutHoldsTab from "@/components/admin/ops/PayoutHoldsTab";
import StorefrontsTab from "@/components/admin/ops/StorefrontsTab";
import FleetHealthTab from "@/components/admin/ops/FleetHealthTab";

const ComplianceSummary = () => <OpsShortcutTab title="Compliance Queue" description="Compliance remains a dedicated workflow. Use this shortcut for document review, reminders, and approval actions." href="/admin/compliance-queue" items={[{ label: "Workflow", value: "Standalone queue preserved" }, { label: "Primary action", value: "Review host and vehicle documents" }, { label: "Route", value: "/admin/compliance-queue" }]} />;
const DisputesSummary = () => <OpsShortcutTab title="Disputes" description="Disputes remain standalone to preserve evidence, payout holds, Stripe references, and resolution workflows." href="/admin/disputes" items={[{ label: "Workflow", value: "Standalone dispute workspace" }, { label: "Primary action", value: "Review and resolve cases" }, { label: "Route", value: "/admin/disputes" }]} />;
const AuditSummary = () => <OpsShortcutTab title="Audit Log" description="Audit records remain separate for governance and review. Operations Center only links to the immutable activity trail." href="/admin/audit-log" items={[{ label: "Workflow", value: "Standalone audit trail" }, { label: "Primary action", value: "Review platform events" }, { label: "Route", value: "/admin/audit-log" }]} />;

const TABS = [
  { id: "alerts",      label: "Alerts",        icon: Bell,          component: AdminOperationalAlerts },
  { id: "compliance",  label: "Compliance",     icon: Shield,        component: ComplianceSummary },
  { id: "payouts",     label: "Payout Holds",   icon: Lock,          component: PayoutHoldsTab },
  { id: "disputes",    label: "Disputes",       icon: AlertTriangle, component: DisputesSummary },
  { id: "storefronts", label: "Storefronts",    icon: Globe,         component: StorefrontsTab },
  { id: "fleet",       label: "Fleet Health",   icon: Wrench,        component: FleetHealthTab },
  { id: "audit",       label: "Audit Log",      icon: FileText,      component: AuditSummary },
];

export default function AdminOperationsCenter() {
  const [activeTab, setActiveTab] = useState("alerts");

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component;

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-5 pb-3 border-b border-border/50">
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Phase 2C</p>
        <h1 className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>
          Operations Center
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Unified admin oversight — alerts are managed here; compliance, disputes, and audit remain linked standalone workflows.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 px-4 sm:px-6 py-2 border-b border-border/50 overflow-x-auto no-scrollbar">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${
                isActive
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
              style={isActive ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content — each component manages its own scroll and padding */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 pb-0"><PaymentOperationalAlertPanel scope="admin" compact limit={2} /></div>
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
}