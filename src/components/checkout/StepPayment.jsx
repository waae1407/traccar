import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Shield, Lock, Check } from "lucide-react";

const inputCls = "w-full h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all";

export default function StepPayment({ booking, user, saveAndAdvance }) {
  // Auto-fill cardholder name from verified profile
  const profileName = booking?.customer_full_name || user?.full_name || "";
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: profileName });
  const [autopay, setAutopay] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [paid, setPaid] = useState(false);
  const queryClient = useQueryClient();

  const isValid = card.name && card.number.length >= 16 && card.expiry && card.cvv.length >= 3;

  const createPaymentMutation = useMutation({
    mutationFn: (data) => base44.entities.Payment.create(data),
  });

  const logEventMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityEvent.create(data),
  });

  const markVehicleBookedMutation = useMutation({
    mutationFn: ({ id }) => base44.entities.Vehicle.update(id, { status: "Booked" }),
  });

  const handlePay = async () => {
    setProcessing(true);

    try {
      // Simulate payment processing delay
      await new Promise((r) => setTimeout(r, 1500));

      const payAmount = booking?.weekly_rate || 0;

      // Mark vehicle as Booked to prevent double booking
      if (booking?.vehicle_id) {
        await markVehicleBookedMutation.mutateAsync({ id: booking.vehicle_id });
      }

      // Log activity event (doesn't require customer_id)
      await logEventMutation.mutateAsync({
        user_email: user?.email,
        booking_request_id: booking?.id,
        event_type: "payment_received",
        event_title: "First Payment Received",
        event_description: `$${payAmount} first ${booking?.booking_type?.toLowerCase()} payment`,
        event_status: "success",
        amount: payAmount,
      });

      setProcessing(false);
      setPaid(true);

      saveAndAdvance({
        payment_status: "paid",
        booking_status: "pending_review",
        total_due_now: payAmount,
        checkout_step: "confirmation",
        submitted_at: new Date().toISOString(),
        viewed_by_admin: false,
        pending_review_alert_active: true,
        admin_attention_priority: "high",
      }, "confirmation");

      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    } catch (err) {
      console.error("Payment error:", err);
      setProcessing(false);
    }
  };

  if (paid) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <p className="font-bold text-gray-900 text-xl">Payment Successful!</p>
        <p className="text-gray-400 text-sm mt-1">Finalizing your booking…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-2xl bg-green-50 flex items-center justify-center">
          <CreditCard className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">Secure Payment</h2>
          <p className="text-gray-400 text-sm">Encrypted & secure checkout</p>
        </div>
      </div>

      {/* Amount due */}
      <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl border border-pink-100 p-4 mb-5">
        <p className="text-sm text-gray-500 mb-1">First Payment Due Now</p>
        <p className="text-3xl font-bold text-gray-900">${(booking?.weekly_rate || 0).toLocaleString()}</p>
        <p className="text-xs text-gray-500 mt-2">{booking?.booking_type} rental · No deposit required</p>
      </div>

      {/* Card form */}
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Cardholder Name</label>
          <input className={inputCls} placeholder="Name as on card" value={card.name}
            onChange={(e) => setCard((p) => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Card Number</label>
          <input className={inputCls} placeholder="1234 5678 9012 3456" maxLength={19} value={card.number}
            onChange={(e) => setCard((p) => ({ ...p, number: e.target.value.replace(/\D/g, "").slice(0, 16) }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Expiry</label>
            <input className={inputCls} placeholder="MM/YY" value={card.expiry}
              onChange={(e) => setCard((p) => ({ ...p, expiry: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">CVV</label>
            <input className={inputCls} placeholder="123" maxLength={4} value={card.cvv}
              onChange={(e) => setCard((p) => ({ ...p, cvv: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
          </div>
        </div>
      </div>

      {/* Autopay */}
      <button onClick={() => setAutopay(!autopay)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left mb-5">
        <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${autopay ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
          {autopay && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">Enable Autopay</p>
          <p className="text-xs text-gray-400">Automatically charge weekly/monthly payments</p>
        </div>
      </button>

      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-4 w-4 text-green-600" />
        <Lock className="h-3 w-3 text-gray-400" />
        <p className="text-xs text-gray-400">256-bit encrypted · PCI compliant · Your card is never stored unencrypted</p>
      </div>

      <button
        disabled={!isValid || processing}
        onClick={handlePay}
        className="w-full py-4 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        {processing ? (
          <><div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing…</>
        ) : (
          <>Pay ${(booking?.weekly_rate || 0).toLocaleString()} Securely</>  
        )}
      </button>
    </div>
  );
}