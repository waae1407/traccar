import { uploadFile } from "@/utils/uploadFile";
import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, Upload, Loader2, AlertTriangle, Shield, User, Building2, CreditCard, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const STEP_LABELS = ["Identity", "Business & Tax", "Review & Approve"];

const inputClass = "w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-primary/50";
const labelClass = "block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5";

const BUSINESS_TYPES = [
  { value: "sole_proprietor", label: "Sole Proprietor" },
  { value: "llc", label: "LLC" },
  { value: "s_corp", label: "S-Corp" },
  { value: "c_corp", label: "C-Corp" },
  { value: "partnership", label: "Partnership" },
];

export default function HostVerificationPanel({ host: hostProp, open, onClose }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState({});
  const [verificationNotes, setVerificationNotes] = useState("");
  const [taxData, setTaxData] = useState({
    business_type: "",
    ein_number: "",
    business_legal_name: "",
    ssn_last4: "",
    tax_classification: "",
  });

  // Fetch fresh host data so fields are always up to date
  const { data: freshHosts = [] } = useQuery({
    queryKey: ["host-detail", hostProp?.id],
    queryFn: () => base44.entities.Host.filter({ id: hostProp?.id }),
    enabled: !!hostProp?.id && open,
  });
  const host = freshHosts[0] || hostProp;

  // Sync taxData when fresh host data arrives (or fall back to hostProp)
  useEffect(() => {
    const h = freshHosts[0] || hostProp;
    if (h) {
      setTaxData({
        business_type: h.business_type || "",
        ein_number: h.ein_number || "",
        business_legal_name: h.business_legal_name || h.business_name || "",
        ssn_last4: h.ssn_last4 || "",
        tax_classification: h.tax_classification || "",
      });
      setVerificationNotes(h.verification_notes || "");
    }
  }, [freshHosts[0]?.id, freshHosts[0]?.updated_date, hostProp?.id]);

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Host.update(host.id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-hosts"] }),
  });

  const handleUpload = async (e, field) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(p => ({ ...p, [field]: true }));
    const res = await uploadFile(file);
    await updateMutation.mutateAsync({ [field]: res.file_url });
    setUploading(p => ({ ...p, [field]: false }));
  };

  const requestDocs = async () => {
    await base44.functions.invoke("requestHostDocs", { host_id: host.id });
    qc.invalidateQueries({ queryKey: ["admin-hosts"] });
  };

  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  const validateTaxInfo = async () => {
    setValidating(true);
    setValidationResult(null);
    try {
      const name = taxData.business_legal_name || host?.full_name;
      const identifier = taxData.ein_number
        ? `EIN: ${taxData.ein_number}`
        : taxData.ssn_last4
        ? `SSN last 4: ${taxData.ssn_last4}`
        : null;

      if (!name || !identifier) {
        setValidationResult({ status: "warning", message: "Missing name or tax identifier — cannot validate." });
        setValidating(false);
        return;
      }

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a fraud prevention assistant. A host is applying to a vehicle rental platform.
Name provided: "${name}"
${identifier}
Business type: ${taxData.business_type || "not specified"}

Based on publicly available IRS and business registry information, does this name reasonably match the tax identifier format and type provided? Flag any obvious red flags or inconsistencies (e.g. name doesn't match business type, EIN format wrong, obvious mismatch). 
Respond with a JSON object: { "risk": "low" | "medium" | "high", "flags": ["..."], "summary": "one sentence summary" }`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            risk: { type: "string" },
            flags: { type: "array", items: { type: "string" } },
            summary: { type: "string" }
          }
        }
      });
      setValidationResult(result);
    } catch (err) {
      setValidationResult({ risk: "unknown", flags: [], summary: "Validation service unavailable." });
    }
    setValidating(false);
  };

  const handleApprove = async () => {
    await updateMutation.mutateAsync({
      ...taxData,
      verification_status: "verified",
      verification_notes: verificationNotes,
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    await base44.functions.invoke("approveHost", { host_id: host.id, host_email: host.email, host_name: host.full_name });
    onClose();
  };

  const handleReject = async () => {
    await updateMutation.mutateAsync({
      verification_status: "failed",
      verification_notes: verificationNotes,
      status: "rejected",
    });
    onClose();
  };

  const DocUpload = ({ field, label, currentUrl }) => (
    <div>
      <p className={labelClass}>{label}</p>
      {currentUrl ? (
        <div className="flex items-center gap-2">
          <a href={currentUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" /> View Document
          </a>
          <label className="cursor-pointer flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white/50 text-xs font-semibold hover:bg-white/[0.10]">
            <Upload className="h-3.5 w-3.5" /> Replace
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleUpload(e, field)} />
          </label>
        </div>
      ) : (
        <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white/50 text-xs font-semibold hover:bg-white/[0.10] w-fit">
          {uploading[field] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload {label}
          <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => handleUpload(e, field)} />
        </label>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border border-white/[0.08]"
        style={{ background: "hsl(222 28% 10%)" }}>
        <DialogHeader>
          <DialogTitle className="text-white font-syne text-xl">
            Host Verification — {host?.full_name}
          </DialogTitle>
        </DialogHeader>

        {/* Step tabs */}
        <div className="flex gap-1 mb-6">
          {STEP_LABELS.map((label, i) => (
            <button key={i} onClick={() => setStep(i)}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${step === i ? "text-white" : "text-white/30 bg-white/[0.04]"}`}
              style={step === i ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : {}}>
              {i + 1}. {label}
            </button>
          ))}
        </div>

        {/* Step 0: Identity */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-white/[0.04] border border-white/[0.06]">
              <User className="h-5 w-5 text-primary" />
              <div>
                <p className="font-bold text-white text-sm">{host?.full_name}</p>
                <p className="text-xs text-white/40">{host?.email} · {host?.phone}</p>
              </div>
              <span className={`ml-auto text-xs px-2.5 py-1 rounded-full font-semibold ${
                host?.verification_status === "verified" ? "bg-green-500/20 text-green-400" :
                host?.verification_status === "docs_submitted" ? "bg-blue-500/20 text-blue-400" :
                host?.verification_status === "docs_requested" ? "bg-yellow-500/20 text-yellow-400" :
                "bg-white/10 text-white/40"}`}>
                {host?.verification_status?.replace(/_/g, " ") || "not started"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <DocUpload field="id_front_url" label="Government ID — Front" currentUrl={host?.id_front_url} />
              <DocUpload field="id_back_url" label="Government ID — Back" currentUrl={host?.id_back_url} />
              <DocUpload field="selfie_url" label="Selfie with ID" currentUrl={host?.selfie_url} />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={requestDocs}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 transition-all">
                <AlertTriangle className="h-4 w-4" /> Request Docs from Host
              </button>
              <button onClick={() => setStep(1)}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                Next: Business & Tax →
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Business & Tax */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold text-white">Business Entity & Tax Info</p>
            </div>
            <p className="text-xs text-white/40">This information is passed to Stripe Connect for accurate 1099-K tax filing.</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Business Type</label>
                <select className={inputClass} value={taxData.business_type} onChange={e => setTaxData(p => ({ ...p, business_type: e.target.value }))}>
                  <option value="">Select type</option>
                  {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Legal Business Name</label>
                <input className={inputClass} value={taxData.business_legal_name} onChange={e => setTaxData(p => ({ ...p, business_legal_name: e.target.value }))} placeholder="As filed with IRS" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>EIN Number</label>
                <input className={inputClass} value={taxData.ein_number} onChange={e => setTaxData(p => ({ ...p, ein_number: e.target.value }))} placeholder="XX-XXXXXXX" />
                <p className="text-[10px] text-white/30 mt-1">Required for LLC, Corp, Partnership</p>
              </div>
              <div>
                <label className={labelClass}>SSN Last 4 (Sole Prop only)</label>
                <input className={inputClass} value={taxData.ssn_last4} onChange={e => setTaxData(p => ({ ...p, ssn_last4: e.target.value }))} placeholder="XXXX" maxLength={4} />
                <p className="text-[10px] text-white/30 mt-1">Only for sole proprietors</p>
              </div>
            </div>

            <div>
              <label className={labelClass}>Tax Classification</label>
              <input className={inputClass} value={taxData.tax_classification} onChange={e => setTaxData(p => ({ ...p, tax_classification: e.target.value }))} placeholder="e.g. Single-member LLC / Individual" />
            </div>

            <DocUpload field="ein_letter_url" label="IRS EIN Confirmation Letter" currentUrl={host?.ein_letter_url} />

            {/* AI Fraud Validation */}
            <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-white/60 uppercase tracking-wider">AI Tax ID Validation</p>
                <button onClick={validateTaxInfo} disabled={validating}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  {validating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                  {validating ? "Checking…" : "Run Fraud Check"}
                </button>
              </div>
              {validationResult && (
                <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                  validationResult.risk === "low" ? "bg-green-500/10 border-green-500/20 text-green-300" :
                  validationResult.risk === "high" ? "bg-red-500/10 border-red-500/20 text-red-300" :
                  "bg-yellow-500/10 border-yellow-500/20 text-yellow-300"
                }`}>
                  <p className="font-bold uppercase tracking-wide">Risk: {validationResult.risk?.toUpperCase()}</p>
                  <p>{validationResult.summary}</p>
                  {validationResult.flags?.length > 0 && (
                    <ul className="list-disc list-inside space-y-0.5 opacity-80">
                      {validationResult.flags.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(0)} className="px-5 py-2 rounded-xl text-sm font-semibold text-white/50 bg-white/[0.06] hover:bg-white/[0.10]">← Back</button>
              <button onClick={async () => { await updateMutation.mutateAsync(taxData); setStep(2); }}
                disabled={updateMutation.isPending}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                Save & Review →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Review & Approve */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-primary" />
              <p className="text-sm font-bold text-white">Final Review</p>
            </div>

            {/* Summary */}
            <div className="rounded-2xl border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden">
              {[
                { label: "ID Front", ok: !!host?.id_front_url },
                { label: "ID Back", ok: !!host?.id_back_url },
                { label: "Selfie", ok: !!host?.selfie_url },
                { label: "Business Type", ok: !!taxData.business_type },
                { label: "EIN / SSN", ok: !!(taxData.ein_number || taxData.ssn_last4) },
                ...(taxData.business_type && taxData.business_type !== "sole_proprietor"
                  ? [{ label: "EIN Letter", ok: !!host?.ein_letter_url }]
                  : []),
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-white/60">{item.label}</span>
                  {item.ok
                    ? <CheckCircle2 className="h-4 w-4 text-green-400" />
                    : <span className="text-xs text-yellow-400 font-semibold">Missing</span>}
                </div>
              ))}
            </div>

            <div>
              <label className={labelClass}>Admin Notes (optional)</label>
              <textarea className={inputClass} rows={3} value={verificationNotes} onChange={e => setVerificationNotes(e.target.value)} placeholder="Internal notes about this host..." />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={() => setStep(1)} className="px-5 py-2 rounded-xl text-sm font-semibold text-white/50 bg-white/[0.06] hover:bg-white/[0.10]">← Back</button>
              <button onClick={handleReject} disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-all">
                <XCircle className="h-4 w-4" /> Reject
              </button>
              <button onClick={handleApprove} disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white ml-auto"
                style={{ background: "linear-gradient(135deg, hsl(152 60% 42%), hsl(152 60% 36%))" }}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve & Send Welcome Email
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}