import React, { useState } from "react";
import { FileText, PenLine } from "lucide-react";
import { format } from "date-fns";

function generateContractHTML(booking, vehicle) {
  const date = format(new Date(), "MMMM d, yyyy");
  const isRTO = booking?.booking_type === "Rent-to-Own";
  return `
    <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.6; max-width: 600px;">
      <div style="text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e91e8c;">
        <h1 style="color: #e91e8c; font-size: 22px; margin: 0;">uRide</h1>
        <h2 style="font-size: 16px; margin-top: 8px; color: #333;">${isRTO ? "Rent-to-Own Agreement" : "Vehicle Rental Agreement"}</h2>
        <p style="font-size: 12px; color: #666;">Agreement Date: ${date}</p>
      </div>

      <p><strong>Customer:</strong> ${booking?.customer_full_name || "—"}</p>
      <p><strong>Vehicle:</strong> ${booking?.vehicle_name || "—"}</p>
      <p><strong>City:</strong> ${booking?.city || "—"}</p>
      <p><strong>Rental Type:</strong> ${booking?.booking_type}</p>
      ${booking?.start_date ? `<p><strong>Start Date:</strong> ${booking.start_date}</p>` : ""}

      <hr style="margin: 16px 0; border-color: #eee;" />
      <h3 style="color: #333;">Payment Terms</h3>
      <p><strong>Weekly Rate:</strong> $${booking?.weekly_rate || 0}</p>
      <p><strong>Security Deposit:</strong> $${booking?.deposit_amount || 0}</p>
      <p><strong>Total Due Today:</strong> $${booking?.total_due_now || 0}</p>

      <hr style="margin: 16px 0; border-color: #eee;" />
      <h3 style="color: #333;">Rental Terms</h3>
      <p>The vehicle must be returned in the same condition as received. Renter is responsible for any damage not covered by provided insurance.</p>
      <p>Late return or missed payment may result in account review or suspension of booking privileges.</p>
      <p>Usage must comply with all applicable traffic laws. Vehicle is not to be used outside the agreed pickup city without prior written consent.</p>
      <p>Full tank required at return, or a refueling fee will apply.</p>

      ${isRTO ? `
      <hr style="margin: 16px 0; border-color: #eee;" />
      <h3 style="color: #e91e8c;">Rent-to-Own Terms</h3>
      <p>Consistent weekly payments build ownership equity. After completing all required payments, the vehicle title will be transferred to the renter.</p>
      <p>Missed or late payments will result in account status change to "at_risk". Continued non-payment may result in account suspension.</p>
      <p>Customer is responsible for maintenance of the vehicle throughout the contract period.</p>
      <p>Early payoff is permitted with notice. Contact uRide support for early payoff details.</p>
      ` : ""}

      <hr style="margin: 16px 0; border-color: #eee;" />
      <p style="font-size: 12px; color: #666;">By signing below, you confirm you have read and agree to all terms of this agreement.</p>
    </div>
  `;
}

export default function StepContract({ booking, vehicle, saveAndAdvance }) {
  const [signatureName, setSignatureName] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const contractHTML = generateContractHTML(booking, vehicle);
  const canSign = reviewed && signatureName.trim().length > 2;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-2xl bg-purple-50 flex items-center justify-center">
          <FileText className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">Your Contract</h2>
          <p className="text-gray-400 text-sm">Read the full agreement before signing.</p>
        </div>
      </div>

      {/* Contract viewer */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 max-h-72 overflow-y-auto text-sm mb-4"
        dangerouslySetInnerHTML={{ __html: contractHTML }} />

      {/* Reviewed checkbox */}
      <button onClick={() => setReviewed(!reviewed)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left mb-4">
        <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${reviewed ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
          {reviewed && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
        <p className="text-sm text-gray-700">I have read and reviewed the full contract above.</p>
      </button>

      {/* E-signature */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          <PenLine className="inline h-3 w-3 mr-1" />Type Your Legal Name to Sign
        </label>
        <input
          className="w-full h-12 px-4 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-lg font-medium italic"
          placeholder="Your full legal name"
          value={signatureName}
          onChange={(e) => setSignatureName(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1">This constitutes your legal electronic signature.</p>
      </div>

      <button
        disabled={!canSign}
        onClick={() => saveAndAdvance({
          signature_name: signatureName,
          signed_at: new Date().toISOString(),
          contract_html: contractHTML,
          contract_status: "signed",
          booking_status: "pending_payment",
        }, "payment")}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        Sign & Proceed to Payment
      </button>
    </div>
  );
}