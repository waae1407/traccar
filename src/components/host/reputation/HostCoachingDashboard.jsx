import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, MessageSquareText, Shield, Star, Wrench, Camera } from "lucide-react";

function Row({ done, icon: Icon, title, text, href }) {
  return (
    <Link to={href} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3 hover:border-pink-100 hover:bg-pink-50 transition-all">
      <div className={`h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0 ${done ? "bg-emerald-50" : "bg-gray-50"}`}>
        {done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Icon className="h-4 w-4 text-pink-500" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{text}</p>
      </div>
      <span className="text-xs font-bold text-pink-600">Improve →</span>
    </Link>
  );
}

export default function HostCoachingDashboard({ snapshots = [] }) {
  const latest = snapshots[0];
  if (!latest) return null;

  const rows = [
    { icon: Star, title: "Collect renter reviews", text: `${latest.verified_review_count || 0} verified reviews collected.`, done: (latest.verified_review_count || 0) >= 3, href: "/host/customers" },
    { icon: Wrench, title: "Upload maintenance receipts", text: `${latest.verified_maintenance_count || 0} verified service records.`, done: (latest.verified_maintenance_count || 0) > 0, href: "/host/maintenance" },
    { icon: Camera, title: "Complete inspections", text: `${latest.inspection_completeness_pct || 0}% inspection completeness.`, done: (latest.inspection_completeness_pct || 0) >= 70, href: "/host/payments" },
    { icon: Shield, title: "Keep compliance current", text: `${latest.expired_compliance_count || 0} expired docs detected.`, done: (latest.compliance_docs_count || 0) > 0 && (latest.expired_compliance_count || 0) === 0, href: "/host/compliance" },
    { icon: MessageSquareText, title: "Use message threads", text: `${latest.communication_threads_count || 0} communication threads captured.`, done: (latest.communication_threads_count || 0) > 0, href: "/host/communications" },
  ];

  return (
    <div className="rounded-3xl border border-gray-100 bg-gray-50 p-4">
      <div className="mb-3">
        <p className="text-sm font-black text-gray-900">Trust-building checklist</p>
        <p className="text-xs text-gray-500 mt-0.5">Coaching only — helps strengthen evidence without public scores.</p>
      </div>
      <div className="grid gap-2">
        {rows.map((row) => <Row key={row.title} {...row} />)}
      </div>
    </div>
  );
}