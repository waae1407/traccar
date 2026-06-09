import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { FileText, PenLine, ShieldCheck, KeyRound, CheckCircle2 } from "lucide-react";
import usePersistentFormDraft from "@/hooks/usePersistentFormDraft";
import { templateForBookingType } from "./contracts/contractTemplateConfig";
import { generateContractDocument } from "./contracts/ContractDocument";
import InitialClause from "./InitialClause";

// ─── Clause definitions ────────────────────────────────────────────────────────
const COMMON_CLAUSES = [
  {
    id: "recurring_payment",
    label: "Recurring Payment Authorization",
    severity: "high",
    text: "I authorize uRide to charge my saved payment method on a recurring weekly basis for the rental rate shown above. I understand charges will continue until I cancel through my account.",
  },
  {
    id: "repossession_policy",
    label: "Late Payment & Repossession Policy",
    severity: "high",
    text: "I understand that if a payment fails and is not cured within the grace period, uRide may remotely disable and repossess the vehicle at my expense. All associated repossession costs will be my responsibility.",
  },
  {
    id: "damage_authorization",
    label: "Damage & Additional Charges Authorization",
    severity: "high",
    text: "I authorize uRide to charge my payment method on file for any damages, tolls, cleaning fees, refueling fees, or other costs incurred during my rental period beyond normal wear and tear.",
  },
  {
    id: "gps_tracking",
    label: "GPS Tracking Consent",
    severity: "medium",
    text: "I acknowledge that the vehicle is equipped with GPS tracking technology. uRide may use location data to verify vehicle use, enforce rental zone agreements, and support recovery in the event of non-payment or unauthorized use.",
  },
  {
    id: "clean_return",
    label: "Clean Return Incentive — Conditional",
    severity: "medium",
    text: "I understand the $50 clean return refund or credit is conditional and determined solely by uRide based on before-and-after photo comparison. Eligibility is not guaranteed and is at uRide's discretion.",
  },
];

const RTO_CLAUSE = {
  id: "rto_forfeiture",
  label: "Rent-to-Own: Forfeiture & Repossession",
  severity: "high",
  text: "I understand that a missed or failed payment breaks the consecutive payment requirement. This results in immediate account status change to 'At Risk,' potential repossession of the vehicle, and forfeiture of ALL prior payments made. Ownership title transfers ONLY after all required consecutive payments are fully completed.",
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function StepContract({ booking, vehicle, user, saveAndAdvance }) {
  const isRTO = booking?.booking_type === "Rent-to-Own";
  const templateConfig = templateForBookingType(booking?.booking_type);
  const { data: hostTemplates = [] } = useQuery({
    queryKey: ["contract-template", booking?.host_id, templateConfig.type],
    queryFn: () => base44.entities.ContractTemplate.filter({ host_id: booking.host_id, template_type: templateConfig.type, status: "active" }, "-updated_date", 1),
    enabled: !!booking?.host_id,
  });
  const { data: defaultTemplates = [] } = useQuery({
    queryKey: ["contract-template-default", templateConfig.type],
    queryFn: () => base44.entities.ContractTemplate.filter({ host_id: "default", template_type: templateConfig.type, status: "active" }, "-updated_date", 1),
    enabled: !!templateConfig.type,
  });
  const { data: commerceProfiles = [] } = useQuery({
    queryKey: ["contract-commerce-profile", booking?.host_id],
    queryFn: () => base44.entities.HostCommerceProfile.filter({ host_id: booking.host_id }, "-updated_date", 1),
    enabled: !!booking?.host_id,
  });
  const { data: plans = [] } = useQuery({
    queryKey: ["contract-operator-plan", booking?.host_id],
    queryFn: () => base44.entities.OperatorPlanConfiguration.filter({ host_id: booking.host_id }, "-updated_date", 1),
    enabled: !!booking?.host_id,
  });
  const { data: hosts = [] } = useQuery({
    queryKey: ["contract-host", booking?.host_id],
    queryFn: () => base44.entities.Host.filter({ id: booking.host_id }),
    enabled: !!booking?.host_id,
  });
  const activeTemplate = hostTemplates[0] || defaultTemplates[0];
  const commerceProfile = commerceProfiles[0];
  const plan = plans[0];
  const host = hosts[0];
  const isFleetOSContract = commerceProfile?.plan_type === "fleetos_professional" || plan?.active_mode === "fleetos_professional" || plan?.selected_mode === "fleetos_professional";
  const contractType = templateConfig.type;
  const baseContractHTML = generateContractDocument({
    booking,
    contractType,
    isFleetOS: isFleetOSContract,
    hostName: host?.business_name || host?.full_name,
  });
  const templateHTML = activeTemplate?.template_html ? `<hr/><h3>Template Terms</h3>${activeTemplate.template_html}` : "";
  const policyHTML = activeTemplate ? `<hr/><h3>Host Policies</h3><p><strong>Deposit:</strong> $${activeTemplate.deposit || 0}</p><p><strong>Late Fees:</strong> ${activeTemplate.late_fees || "Standard late fees apply."}</p><p><strong>Mileage:</strong> ${activeTemplate.mileage_rules || "Standard mileage rules apply."}</p><p><strong>Insurance:</strong> ${activeTemplate.insurance_requirements || "Valid insurance is required."}</p><p><strong>Smoking Fees:</strong> ${activeTemplate.smoking_fees || "Smoking is prohibited."}</p><p><strong>Return Policy:</strong> ${activeTemplate.return_policies || "Vehicle must be returned in the same condition."}</p>` : "";
  const contractHTML = `${baseContractHTML}${templateHTML}${policyHTML}`;
  const contractVersion = activeTemplate?.version || templateConfig.version;

  const providerName = isFleetOSContract ? (host?.business_name || host?.full_name || "Host Business") : "uRide";
  const commonClauses = isFleetOSContract
    ? COMMON_CLAUSES.map((clause) => ({ ...clause, text: clause.text.replaceAll("uRide", providerName) }))
    : COMMON_CLAUSES;
  const clauses = isRTO ? [...commonClauses, RTO_CLAUSE] : commonClauses;

  // initials state: { clause_id: string }
  const [initials, setInitials, clearInitialsDraft] = usePersistentFormDraft(
    `checkout_contract_initials_draft:${booking?.id}`,
    Object.fromEntries(clauses.map((c) => [c.id, ""]))
  );
  const [signatureName, setSignatureName, clearSignatureDraft] = usePersistentFormDraft(`checkout_contract_signature_draft:${booking?.id}`, "");
  const [contractReviewed, setContractReviewed, clearReviewedDraft] = usePersistentFormDraft(`checkout_contract_reviewed_draft:${booking?.id}`, false);

  const handleInitials = (id, val) => setInitials((p) => ({ ...p, [id]: val }));

  const allInitialed = clauses.every((c) => initials[c.id].trim().length >= 1);
  const canSign = allInitialed && contractReviewed && signatureName.trim().length > 2;

  const handleSign = async () => {
    const signedAt = new Date().toISOString();
    const deviceInfo = navigator.userAgent || "unknown";
    let signatureEvidence = {
      signature_ip_address: null,
      signature_user_agent: deviceInfo,
      signature_device_info: deviceInfo,
      signature_timestamp: signedAt,
      signature_user_id: user?.id || "",
      signature_email: user?.email || "",
      contract_signed_at: signedAt,
      contract_signature_evidence_status: "partial"
    };

    const evidenceResponse = await base44.functions.invoke("captureContractSignatureEvidence", { booking_request_id: booking.id });
    signatureEvidence = { ...signatureEvidence, ...(evidenceResponse.data || {}) };

    // Build per-clause initials record
    const initialsRecord = Object.fromEntries(
      clauses.map((c) => [
        c.id,
        {
          initials: initials[c.id],
          signed_at: signedAt,
          clause_version: contractVersion,
        },
      ])
    );

    clearInitialsDraft();
    clearSignatureDraft();
    clearReviewedDraft();
    saveAndAdvance({
      signature_name: signatureName,
      ...signatureEvidence,
      signed_at: signedAt,
      contract_html: contractHTML,
      contract_type: contractType,
      contract_version: contractVersion,
      contract_status: "signed",
      contract_initials: JSON.stringify(initialsRecord),
      booking_status: "pending_payment",
    }, "payment");
  };

  const completedCount = clauses.filter((c) => initials[c.id].trim().length >= 1).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${isRTO ? "bg-purple-50" : "bg-blue-50"}`}>
          {isRTO ? <KeyRound className="h-6 w-6 text-purple-600" /> : <FileText className="h-6 w-6 text-blue-600" />}
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">
            {templateConfig.label}
          </h2>
          <p className="text-gray-400 text-sm">Version {contractVersion} · Initial each clause below.</p>
        </div>
      </div>

      {/* Contract type badge */}
      <div className={`mb-4 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${isRTO ? "bg-purple-50 text-purple-700 border border-purple-100" : "bg-blue-50 text-blue-700 border border-blue-100"}`}>
        <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
        {isRTO
          ? "Rent-to-Own contract — initials required on all 6 critical clauses below."
          : `${templateConfig.label} — initials required on 5 critical clauses below.`}
      </div>

      {/* Full contract viewer */}
      <details className="mb-5">
        <summary className="cursor-pointer text-sm font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2 select-none">
          <FileText className="h-4 w-4 text-gray-400" />
          View Full Contract Document
          <span className="ml-auto text-xs text-gray-400">tap to expand</span>
        </summary>
        <div
          className="mt-2 bg-white rounded-2xl border border-gray-200 p-4 max-h-64 overflow-y-auto text-sm shadow-inner"
          dangerouslySetInnerHTML={{ __html: contractHTML }}
        />
      </details>

      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
          Required Initials — Critical Clauses
        </p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          completedCount === clauses.length ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
        }`}>
          {completedCount}/{clauses.length} completed
        </span>
      </div>

      {/* Clause initials */}
      <div className="space-y-3 mb-5">
        {clauses.map((clause) => (
          <InitialClause
            key={clause.id}
            id={clause.id}
            label={clause.label}
            text={clause.text}
            severity={clause.severity}
            value={initials[clause.id]}
            onChange={handleInitials}
          />
        ))}
      </div>

      {/* Reviewed checkbox — only show after all initialed */}
      {allInitialed && (
        <button
          onClick={() => setContractReviewed(!contractReviewed)}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left mb-4"
        >
          <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${contractReviewed ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
            {contractReviewed && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
          <p className="text-sm text-gray-700">I have read, understood, and agreed to all terms above.</p>
        </button>
      )}

      {/* Final e-signature — only show after reviewed */}
      {allInitialed && contractReviewed && (
        <div className="mb-5">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            <PenLine className="inline h-3 w-3 mr-1" />Final Signature — Type Your Legal Full Name
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
      )}

      {/* Submit */}
      <button
        disabled={!canSign}
        onClick={handleSign}
        className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
      >
        {!allInitialed
          ? `Initial all ${clauses.length - completedCount} remaining clause${clauses.length - completedCount !== 1 ? "s" : ""} to continue`
          : !contractReviewed
          ? "Check the confirmation box above"
          : !signatureName.trim()
          ? "Enter your full name to sign"
          : <span className="flex items-center justify-center gap-2"><CheckCircle2 className="h-4 w-4" />Sign &amp; Proceed to Payment →</span>
        }
      </button>
    </div>
  );
}