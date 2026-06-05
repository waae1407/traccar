import React from "react";
import { Button } from "@/components/ui/button";
import { CreditCard, ExternalLink, ShieldCheck } from "lucide-react";

function valueOrDash(value) {
  return value && String(value).trim() ? value : "Not provided";
}

export default function OwnPaymentInstructions({ booking, settings, onSubmitBooking }) {
  const confirmationMode = settings?.booking_confirmation_mode || "manual_host_approval";
  const bookingStatus = confirmationMode === "auto_confirm" ? "confirmed" : "pending_review";
  const proofRequired = confirmationMode === "payment_proof_required" || settings?.manual_payment_proof_required;

  const submit = () => {
    onSubmitBooking({
      payment_status: "pending",
      booking_status: bookingStatus,
      submitted_at: new Date().toISOString(),
      viewed_by_admin: false,
      pending_review_alert_active: true,
      admin_attention_priority: proofRequired ? "high" : "normal",
      admin_notes: "Customer was directed to the host's own payment instructions. No uRideHub/Stripe checkout was used."
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-pink-50 flex items-center justify-center">
          <CreditCard className="h-6 w-6 text-pink-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">Pay the Host Directly</h2>
          <p className="text-gray-400 text-sm">This host uses their own payment system.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Amount due</p>
          <p className="text-3xl font-black text-gray-900">${Number(booking?.total_due_now || booking?.weekly_rate || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-2xl bg-gray-50 p-4 space-y-3 text-sm text-gray-700">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Payment instructions</p>
            <p className="mt-1 whitespace-pre-wrap font-medium">{valueOrDash(settings?.payment_instructions)}</p>
          </div>
          {settings?.accepted_payment_methods?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Accepted methods</p>
              <p className="mt-1 font-medium">{settings.accepted_payment_methods.join(", ")}</p>
            </div>
          )}
          {settings?.payment_link && (
            <a href={settings.payment_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-pink-600 underline">
              Open host payment link <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {settings?.deposit_instructions && <p><strong>Deposit:</strong> {settings.deposit_instructions}</p>}
          {settings?.late_fee_policy && <p><strong>Late fee policy:</strong> {settings.late_fee_policy}</p>}
          {settings?.cancellation_policy && <p><strong>Cancellation/payment policy:</strong> {settings.cancellation_policy}</p>}
          {proofRequired && <p><strong>Proof required:</strong> {settings?.payment_proof_instructions || "The host may ask you to provide proof of payment before confirming."}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-blue-600 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">uRideHub is not collecting this payment. The host will confirm payment and booking details based on their payment policy.</p>
      </div>

      <Button onClick={submit} className="w-full py-4 rounded-xl font-bold text-sm text-white bg-gray-900 hover:bg-gray-800">
        I Understand — Submit Booking Request
      </Button>
    </div>
  );
}