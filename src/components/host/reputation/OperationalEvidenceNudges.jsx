import React from "react";
import { Link } from "react-router-dom";
import { FileCheck2, MessageSquareText, Shield, Wrench } from "lucide-react";

export default function OperationalEvidenceNudges({ maintenanceLogs = [], compliance = [], activeBookings = [], vehicles = [] }) {
  const missingMaintenance = vehicles.length > 0 && maintenanceLogs.length < vehicles.length;
  const missingCompliance = vehicles.length > 0 && compliance.length < vehicles.length * 2;
  const hasActiveRentals = activeBookings.length > 0;

  const items = [
    missingMaintenance && { icon: Wrench, title: "Add receipt-backed maintenance", text: "Upload service receipts so maintenance evidence is stronger than self-reported notes.", href: "/host/maintenance", cta: "Log service" },
    missingCompliance && { icon: Shield, title: "Complete compliance uploads", text: "Insurance and registration records improve internal evidence coverage.", href: "/host/compliance", cta: "Upload docs" },
    hasActiveRentals && { icon: MessageSquareText, title: "Use booking messages", text: "Keep pickup, return, and support updates in threads so response signals are measurable.", href: "/host/communications", cta: "Open messages" },
  ].filter(Boolean);

  if (!items.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <FileCheck2 className="h-4 w-4 text-pink-500" />
        <h3 className="font-bold text-gray-900 text-sm">Evidence checklist</h3>
      </div>
      <div className="space-y-2">
        {items.map(({ icon: Icon, title, text, href, cta }) => (
          <Link key={title} to={href} className="flex items-center gap-3 p-3 rounded-2xl bg-gray-50 border border-gray-100 hover:bg-pink-50 hover:border-pink-100 transition-all">
            <div className="h-9 w-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
              <Icon className="h-4 w-4 text-pink-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{text}</p>
            </div>
            <span className="text-xs font-bold text-pink-600 flex-shrink-0">{cta} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}