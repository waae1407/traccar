import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Upload, CheckCircle2, FileText, Loader2, Shield, AlertTriangle, Building2 } from "lucide-react";

const BUSINESS_TYPES = [
  { value: "sole_proprietor", label: "Sole Proprietor (Individual)" },
  { value: "llc", label: "LLC" },
  { value: "s_corp", label: "S-Corp" },
  { value: "c_corp", label: "C-Corp" },
  { value: "partnership", label: "Partnership" },
];

const inputClass = "w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 text-sm";
const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5";

const statusConfig = {
  not_started: { label: "Not Started", cls: "bg-gray-100 text-gray-500" },
  docs_requested: { label: "Docs Requested — Please upload below", cls: "bg-yellow-50 text-yellow-700 border border-yellow-200" },
  docs_submitted: { label: "Docs Submitted — Under Review", cls: "bg-blue-50 text-blue-700 border border-blue-200" },
  verified: { label: "Verified ✓", cls: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  failed: { label: "Verification Failed — Contact support", cls: "bg-red-50 text-red-600 border border-red-200" },
};

export default function HostVerificationDocs() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState({});

  const { data: hosts = [] } = useQuery({
    queryKey: ["my-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Host.update(host.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-host"] }),
  });

  const handleUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(p => ({ ...p, [field]: true }));
    const res = await base44.integrations.Core.UploadFile({ file });
    const updates = { [field]: res.file_url };
    // If all key docs are now uploaded, mark as submitted
    const current = { ...host, ...updates };
    if (current.id_front_url && current.id_back_url && current.selfie_url) {
      updates.verification_status = "docs_submitted";
    }
    await updateMutation.mutateAsync(updates);
    setUploading(p => ({ ...p, [field]: false }));
  };

  const handleTaxUpdate = (field, value) => {
    updateMutation.mutate({ [field]: value });
  };

  if (!host) return null;

  const statusCfg = statusConfig[host.verification_status || "not_started"];
  const isBusinessEntity = host.business_type && host.business_type !== "sole_proprietor";

  const DocBlock = ({ field, label, desc, currentUrl }) => (
    <div className="p-4 rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-sm font-bold text-gray-900">{label}</p>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
        {currentUrl
          ? <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
          : <FileText className="h-5 w-5 text-gray-300 flex-shrink-0" />}
      </div>
      {currentUrl ? (
        <div className="flex items-center gap-2">
          <a href={currentUrl} target="_blank" rel="noreferrer"
            className="text-xs font-bold text-emerald-600 hover:text-emerald-700 underline">View uploaded file</a>
          <label className="cursor-pointer text-xs text-gray-400 hover:text-gray-600 underline">
            Replace
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleUpload(e, field)} />
          </label>
        </div>
      ) : (
        <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl border border-pink-200 bg-pink-50 text-pink-700 text-xs font-bold hover:bg-pink-100 transition-all w-fit mt-1">
          {uploading[field] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload {label}
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleUpload(e, field)} />
        </label>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>Verification & Tax</h1>
        <p className="text-gray-400 text-sm mt-1">Required to receive payouts and for 1099-K filing</p>
      </div>

      {/* Status banner */}
      <div className={`flex items-center gap-3 p-4 rounded-2xl text-sm font-semibold ${statusCfg.cls}`}>
        <Shield className="h-5 w-5 flex-shrink-0" />
        {statusCfg.label}
      </div>

      {host.verification_status === "verified" ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-500 mb-4" />
          <h3 className="text-lg font-bold text-gray-900">You're fully verified!</h3>
          <p className="text-gray-400 text-sm mt-1">All documents reviewed. Your Stripe 1099-K is configured.</p>
        </div>
      ) : (
        <>
          {/* Identity Docs */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Identity Documents</p>
            <DocBlock field="id_front_url" label="Photo ID — Front" desc="Driver's license or passport" currentUrl={host.id_front_url} />
            <DocBlock field="id_back_url" label="Photo ID — Back" desc="Back of your driver's license" currentUrl={host.id_back_url} />
            <DocBlock field="selfie_url" label="Selfie with ID" desc="Hold your ID next to your face" currentUrl={host.selfie_url} />
          </div>

          {/* Business Type */}
          <div className="space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Business & Tax Info</p>
            <div className="p-4 rounded-2xl border border-gray-100 bg-white shadow-sm space-y-3">
              <div>
                <label className={labelClass}>Business Type</label>
                <select className={inputClass} value={host.business_type || ""}
                  onChange={e => handleTaxUpdate("business_type", e.target.value)}>
                  <option value="">Select your entity type</option>
                  {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {isBusinessEntity && (
                <>
                  <div>
                    <label className={labelClass}>Legal Business Name (as filed with IRS)</label>
                    <input className={inputClass} defaultValue={host.business_legal_name || host.business_name || ""} onBlur={e => handleTaxUpdate("business_legal_name", e.target.value)} placeholder="My Business LLC" />
                  </div>
                  <div>
                    <label className={labelClass}>EIN Number</label>
                    <input className={inputClass} defaultValue={host.ein_number || ""} onBlur={e => handleTaxUpdate("ein_number", e.target.value)} placeholder="XX-XXXXXXX" />
                    <p className="text-xs text-gray-400 mt-1">Found on your IRS EIN confirmation letter</p>
                  </div>
                </>
              )}

              {host.business_type === "sole_proprietor" && (
                <div>
                  <label className={labelClass}>SSN Last 4 Digits</label>
                  <input className={inputClass} defaultValue={host.ssn_last4 || ""} onBlur={e => handleTaxUpdate("ssn_last4", e.target.value)} placeholder="XXXX" maxLength={4} />
                  <p className="text-xs text-gray-400 mt-1">Used for 1099-K matching only</p>
                </div>
              )}
            </div>

            {isBusinessEntity && (
              <DocBlock field="ein_letter_url" label="IRS EIN Confirmation Letter" desc="The letter IRS mailed when you got your EIN (PDF or photo)" currentUrl={host.ein_letter_url} />
            )}
          </div>

          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100 text-sm text-blue-700">
            <p className="font-bold mb-1">Why we need this</p>
            <p className="text-xs leading-relaxed">Federal law requires Stripe to file a 1099-K for any account earning over $600/year. Your EIN or SSN is required for accurate tax reporting. uRide never shares your information with third parties.</p>
          </div>

          {/* Submit button — shown when all 3 ID docs are uploaded */}
          {host.id_front_url && host.id_back_url && host.selfie_url && host.verification_status !== "docs_submitted" && host.verification_status !== "verified" && (
            <button
              onClick={async () => {
                await updateMutation.mutateAsync({ verification_status: "docs_submitted" });
              }}
              disabled={updateMutation.isPending}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 shadow-sm"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit Documents for Review
            </button>
          )}

          {host.verification_status === "docs_submitted" && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Documents Submitted!</p>
                <p className="text-xs text-emerald-600">Our team will review your documents within 1–2 business days.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}