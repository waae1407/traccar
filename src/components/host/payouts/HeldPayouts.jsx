import React from "react";
import { ShieldAlert, Lock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

const HOLD_REASON_CONFIG = {
  dispute:        { label: "Dispute",           color: "text-orange-500", bg: "bg-orange-50 border-orange-200",  icon: AlertTriangle },
  chargeback:     { label: "Chargeback",         color: "text-red-500",    bg: "bg-red-50 border-red-200",        icon: ShieldAlert },
  compliance:     { label: "Compliance Review",  color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200", icon: Lock },
  admin_override: { label: "Admin Hold",         color: "text-purple-600", bg: "bg-purple-50 border-purple-200", icon: Lock },
  reserve_window: { label: "Reserve Window",     color: "text-blue-600",   bg: "bg-blue-50 border-blue-200",     icon: Lock },
  "":             { label: "Under Review",       color: "text-gray-500",   bg: "bg-gray-50 border-gray-200",     icon: Lock },
};

function fmt(n) {
  return (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function HeldPayouts({ payouts = [] }) {
  const held = payouts.filter(p => p.status === "held" || p.status === "failed");

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-50 flex items-center gap-2">
        <Lock className="h-4 w-4 text-orange-500" />
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Held or Under Review</h3>
          <p className="text-xs text-gray-400 mt-0.5">Payouts delayed pending dispute, compliance, or admin review</p>
        </div>
        {held.length > 0 && (
          <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 border border-orange-200">
            {held.length}
          </span>
        )}
      </div>

      {held.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="h-10 w-10 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-2">
            <ShieldAlert className="h-5 w-5 text-emerald-400" />
          </div>
          <p className="text-sm font-semibold text-gray-700">No payouts held</p>
          <p className="text-xs text-gray-400 mt-1">No payouts are currently held or under review.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {held.map(p => {
            const reasonKey = p.hold_reason || "";
            const cfg = HOLD_REASON_CONFIG[reasonKey] || HOLD_REASON_CONFIG[""];
            const Icon = cfg.icon;
            const net = p.net_host_payout || p.net_payout || 0;

            return (
              <div key={p.id} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className={`h-8 w-8 rounded-xl border flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{p.vehicle_name || "Vehicle"}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-1">
                      {p.period_start && `Period: ${p.period_start} — ${p.period_end}`}
                    </p>
                    {p.hold_notes && (
                      <p className="text-xs text-gray-500 italic">{p.hold_notes}</p>
                    )}
                    {p.release_after && (
                      <p className="text-xs text-blue-600 mt-1 font-medium">
                        Expected release: {format(new Date(p.release_after), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-black text-orange-500">${fmt(net)}</p>
                    <p className="text-[10px] text-gray-400">held</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}