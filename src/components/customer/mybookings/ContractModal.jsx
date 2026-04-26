import React from "react";
import { X, Shield } from "lucide-react";
import { format } from "date-fns";

export default function ContractModal({ booking, onClose }) {
  if (!booking) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 flex-shrink-0">
        <div>
          <h2 className="font-bold text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>
            Rental Agreement
          </h2>
          <p className="text-[11px] text-gray-400 mt-0.5">{booking.vehicle_name}</p>
        </div>
        <button onClick={onClose} className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Law enforcement notice */}
      <div className="mx-4 mt-3 px-4 py-3 rounded-2xl border border-blue-200 flex-shrink-0"
        style={{ background: "linear-gradient(135deg, #eff6ff, #dbeafe)" }}>
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-800">Law Enforcement Authorization</p>
            <p className="text-[11px] text-blue-700 mt-0.5">
              This signed agreement authorizes <strong>{booking.customer_full_name || "the renter"}</strong> to operate{" "}
              <strong>{booking.vehicle_name}</strong> from{" "}
              {booking.start_date ? format(new Date(booking.start_date), "MMM d, yyyy") : "—"}
              {booking.end_date ? ` through ${format(new Date(booking.end_date), "MMM d, yyyy")}` : ""}.
              {booking.signed_at && (
                <> Electronically signed on {format(new Date(booking.signed_at), "MMMM d, yyyy 'at' h:mm a")}.</>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Contract content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {booking.contract_html ? (
          <div
            className="prose prose-sm max-w-none text-gray-800 text-xs leading-relaxed"
            dangerouslySetInnerHTML={{ __html: booking.contract_html }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-gray-400 text-sm">No contract document on file.</p>
          </div>
        )}
      </div>

      {/* Signature footer */}
      {booking.signature_name && (
        <div className="border-t border-gray-100 px-4 py-4 flex-shrink-0"
          style={{ background: "linear-gradient(135deg, #f0fdf4, #dcfce7)" }}>
          <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider mb-1">Electronically Signed</p>
          <p className="text-sm font-bold text-green-800">{booking.signature_name}</p>
          {booking.signed_at && (
            <p className="text-[11px] text-green-700 mt-0.5">
              {format(new Date(booking.signed_at), "MMMM d, yyyy 'at' h:mm a")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}