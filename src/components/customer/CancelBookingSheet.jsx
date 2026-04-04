import React, { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

export default function CancelBookingSheet({ booking, onClose }) {
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: () => base44.entities.BookingRequest.update(booking.id, {
      booking_status: "cancellation_requested",
      cancellation_reason: reason.trim(),
      cancellation_requested_at: new Date().toISOString(),
      pending_review_alert_active: true,
      admin_attention_priority: "urgent",
      viewed_by_admin: false,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-booking-requests"] });
      onClose();
    },
  });

  if (!booking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl p-6">
        <button onClick={onClose} className="absolute top-4 right-4 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
          <X className="h-4 w-4 text-gray-500" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 text-lg">Request Cancellation</h2>
            <p className="text-xs text-gray-400">{booking.vehicle_name}</p>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-100 mb-5">
          <p className="text-xs text-yellow-800">
            <strong>Note:</strong> Cancellations require admin approval. Your rental remains active until approved. Refunds are subject to our cancellation policy.
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Reason for cancellation <span className="text-red-400">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Please explain why you'd like to cancel (e.g. no longer need the vehicle, found alternative transport…)"
            rows={4}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-red-300 focus:ring-2 focus:ring-red-50 resize-none transition-all"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-gray-600 border border-gray-200"
          >
            Keep Rental
          </button>
          <button
            disabled={!reason.trim() || cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 disabled:opacity-40 transition-colors"
          >
            {cancelMutation.isPending ? "Submitting…" : "Request Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}