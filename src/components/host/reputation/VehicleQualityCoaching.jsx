import React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function VehicleQualityCoaching({ vehicle, snapshot, complianceStatus }) {
  const tips = [];
  if (!snapshot || (snapshot.verified_maintenance_count || 0) === 0) tips.push("Add a recent maintenance receipt.");
  if (!snapshot || (snapshot.inspection_completeness_pct || 0) < 70) tips.push("Encourage complete pickup and return inspection photos.");
  if (complianceStatus !== "complete") tips.push("Upload active insurance and registration.");
  if (snapshot?.service_cadence_status === "overdue") tips.push("Update overdue service records.");

  if (!tips.length) {
    return (
      <div className="mb-3 rounded-xl border border-emerald-100 bg-emerald-50 p-2.5 flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <p className="text-xs font-bold text-emerald-700">Evidence checklist looks healthy.</p>
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 p-2.5">
      <div className="flex items-center gap-2 mb-1">
        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
        <p className="text-xs font-bold text-amber-800">Readiness recommendations</p>
      </div>
      {tips.slice(0, 3).map((tip) => <p key={tip} className="text-[10px] text-amber-700">• {tip}</p>)}
    </div>
  );
}