import React, { useState } from "react";
import { FileText, PenLine, ShieldCheck, KeyRound } from "lucide-react";
import { generateWeeklyContract } from "./contracts/WeeklyRentalContract";
import { generateRTOContract } from "./contracts/RentToOwnContract";

export default function StepContract({ booking, vehicle, saveAndAdvance }) {
  const [signatureName, setSignatureName] = useState("");
  const [reviewed, setReviewed] = useState(false);

  const isRTO = booking?.booking_type === "Rent-to-Own";
  const contractHTML = isRTO ? generateRTOContract(booking) : generateWeeklyContract(booking);
  const contractType = isRTO ? "rent_to_own" : "weekly";
  const contractVersion = isRTO ? "RTO-v2.0" : "WR-v2.0";

  const canSign = reviewed && signatureName.trim().length > 2;

  const handleSign = () => {
    saveAndAdvance({
      signature_name: signatureName,
      signature_device_info: navigator.userAgent || "unknown",
      signature_ip_address: "captured-server-side",
      signed_at: new Date().toISOString(),
      contract_html: contractHTML,
      contract_type: contractType,
      contract_version: contractVersion,
      contract_status: "signed",
      booking_status: "pending_payment",
    }, "payment");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${isRTO ? "bg-purple-50" : "bg-blue-50"}`}>
          {isRTO ? <KeyRound className="h-6 w-6 text-purple-600" /> : <FileText className="h-6 w-6 text-blue-600" />}
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">
            {isRTO ? "Rent-to-Own Agreement" : "Weekly Rental Agreement"}
          </h2>
          <p className="text-gray-400 text-sm">Version {contractVersion} · Read fully before signing.</p>
        </div>
      </div>

      {/* Contract type badge */}
      <div className={`mb-4 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${isRTO ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-blue-50 text-blue-700 border border-blue-100"}`}>
        <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
        {isRTO
          ? "This is a Rent-to-Own contract. Missed payments result in forfeiture of all prior payments and repossession."
          : "This is a Weekly Rental contract. Includes clean return incentive ($50 credit) and photo verification."}
      </div>

      {/* Contract viewer */}
      <div
        className="bg-white rounded-2xl border border-gray-200 p-4 max-h-80 overflow-y-auto text-sm mb-4 shadow-inner"
        dangerouslySetInnerHTML={{ __html: contractHTML }}
      />

      {/* Reviewed checkbox */}
      <button
        onClick={() => setReviewed(!reviewed)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left mb-4"
      >
        <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${reviewed ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
          {reviewed && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
        <p className="text-sm text-gray-700">I have read and reviewed the full {isRTO ? "Rent-to-Own" : "Weekly Rental"} agreement above.</p>
      </button>

      {/* E-signature */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          <PenLine className="inline h-3 w-3 mr-1" />Type Your Legal Full Name to Sign
        </label>
        <input
          className="w-full h-12 px-4 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-lg font-medium italic"
          placeholder="Your full legal name"
          value={signatureName}
          onChange={(e) => setSignatureName(e.target.value)}
        />
        <div className="flex items-center gap-2 mt-1.5">
          <ShieldCheck className="h-3 w-3 text-green-500 flex-shrink-0" />
          <p className="text-xs text-gray-400">
            Electronic signature · Timestamp, device info &amp; IP address recorded · Legally binding
          </p>
        </div>
      </div>

      <button
        disabled={!canSign}
        onClick={handleSign}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
      >
        Sign &amp; Proceed to Payment →
      </button>
    </div>
  );
}