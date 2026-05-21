import React, { useState } from "react";
import { Bell, Shield, Lock, AlertTriangle, Globe, FileText } from "lucide-react";

// Existing admin components — rendered directly inside tabs
import AdminOperationalAlerts from "@/pages/admin/AdminOperationalAlerts";
import AdminComplianceQueue from "@/pages/admin/AdminComplianceQueue";
import AdminDisputes from "@/pages/admin/AdminDisputes";
import AdminAuditLog from "@/pages/admin/AdminAuditLog";

// New focused tab components
import PayoutHoldsTab from "@/components/admin/ops/PayoutHoldsTab";
import StorefrontsTab from "@/components/admin/ops/StorefrontsTab";

const TABS = [
  { id: "alerts",      label: "Alerts",        icon: Bell,          component: AdminOperationalAlerts },
  { id: "compliance",  label: "Compliance",     icon: Shield,        component: AdminComplianceQueue },
  { id: "payouts",     label: "Payout Holds",   icon: Lock,          component: PayoutHoldsTab },
  { id: "disputes",    label: "Disputes",       icon: AlertTriangle, component: AdminDisputes },
  { id: "storefronts", label: "Storefronts",    icon: Globe,         component: StorefrontsTab },
  { id: "audit",       label: "Audit Log",      icon: FileText,      component: AdminAuditLog },
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
        <p className="text-sm text-muted-foreground mt-0.5">Unified admin oversight — alerts, compliance, payouts, disputes, and audit.</p>
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
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
}