import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Check, AlertCircle, ShieldCheck } from "lucide-react";

function UploadBox({ label, url, uploading, onChange, required }) {
  return (
    <div className={`relative border-2 border-dashed rounded-2xl p-4 transition-colors ${url ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
      <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={onChange} />
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${url ? "bg-green-100" : "bg-white border border-gray-200"}`}>
          {url ? <Check className="h-5 w-5 text-green-600" /> : <Upload className="h-5 w-5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm">{label} {required && <span className="text-pink-500">*</span>}</p>
          <p className="text-xs text-gray-400 truncate">{uploading ? "Uploading…" : url ? "Uploaded ✓" : "Tap to upload or take photo"}</p>
        </div>
      </div>
      {url && (
        <img src={url} alt="" className="mt-3 h-20 w-full object-cover rounded-xl" />
      )}
    </div>
  );
}

export default function StepVerification({ booking, saveAndAdvance, updateMutation }) {
  const [uploads, setUploads] = useState({
    license_front_url: booking?.license_front_url || "",
    license_back_url: booking?.license_back_url || "",
    selfie_url: booking?.selfie_url || "",
    proof_of_income_url: booking?.proof_of_income_url || "",
  });
  const [uploading, setUploading] = useState({});
  const isRTO = booking?.booking_type === "Rent-to-Own";

  const handleUpload = async (field, file) => {
    if (!file) return;
    setUploading((p) => ({ ...p, [field]: true }));
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploads((p) => ({ ...p, [field]: file_url }));
    if (booking?.id) {
      updateMutation.mutate({ id: booking.id, data: { [field]: file_url } });
    }
    setUploading((p) => ({ ...p, [field]: false }));
  };

  const isValid = uploads.license_front_url && uploads.license_back_url && uploads.selfie_url;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">Identity Verification</h2>
          <p className="text-gray-400 text-sm">Required for all rentals. Keep your ID handy.</p>
        </div>
      </div>

      <div className="space-y-3">
        <UploadBox label="Driver's License (Front)" url={uploads.license_front_url} uploading={uploading.license_front_url}
          required onChange={(e) => handleUpload("license_front_url", e.target.files[0])} />
        <UploadBox label="Driver's License (Back)" url={uploads.license_back_url} uploading={uploading.license_back_url}
          required onChange={(e) => handleUpload("license_back_url", e.target.files[0])} />
        <UploadBox label="Selfie / Live Photo" url={uploads.selfie_url} uploading={uploading.selfie_url}
          required onChange={(e) => handleUpload("selfie_url", e.target.files[0])} />
        {isRTO && (
          <UploadBox label="Proof of Income" url={uploads.proof_of_income_url} uploading={uploading.proof_of_income_url}
            onChange={(e) => handleUpload("proof_of_income_url", e.target.files[0])} />
        )}
      </div>

      <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100 flex gap-2">
        <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">Your documents are encrypted and used only for rental verification. We do not store or share them beyond this purpose.</p>
      </div>

      <button
        disabled={!isValid}
        onClick={() => saveAndAdvance({ ...uploads, verification_status: "submitted" }, "terms")}
        className="w-full mt-5 py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        Submit & Continue
      </button>
    </div>
  );
}