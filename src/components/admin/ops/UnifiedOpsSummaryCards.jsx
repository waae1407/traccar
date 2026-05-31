import React from "react";
import { AlertTriangle, Bell, Activity, ShieldCheck } from "lucide-react";

function SummaryCard({ label, value, icon: Icon, tone }) {
  const tones = {
    red: "border-red-500/25 bg-red-500/10 text-red-300",
    pink: "border-pink-500/25 bg-pink-500/10 text-pink-300",
    blue: "border-blue-500/25 bg-blue-500/10 text-blue-300",
    green: "border-green-500/25 bg-green-500/10 text-green-300",
  };
  return (
    <div className={`rounded-3xl border p-5 shadow-card ${tones[tone]}`}>
      <Icon className="mb-4 h-5 w-5" />
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="text-xs font-bold uppercase tracking-widest opacity-70">{label}</p>
    </div>
  );
}

export default function UnifiedOpsSummaryCards({ needsAction, notifications, events, audit }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Needs Action" value={needsAction.length} icon={AlertTriangle} tone="red" />
      <SummaryCard label="Notifications" value={notifications.length} icon={Bell} tone="pink" />
      <SummaryCard label="Events" value={events.length} icon={Activity} tone="blue" />
      <SummaryCard label="Audit Items" value={audit.length} icon={ShieldCheck} tone="green" />
    </div>
  );
}