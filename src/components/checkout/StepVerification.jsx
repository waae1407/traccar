import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Check, AlertCircle, ShieldCheck, Loader2, XCircle } from "lucide-react";

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

const VerificationStatus = ({ status, message }) => {
  if (status === "checking") return (
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-50 border border-blue-100">
      <Loader2 className="h-5 w-5 text-blue-500 animate-spin flex-shrink-0" />
      <div>
        <p className="font-semibold text-blue-800 text-sm">Verifying Identity…</p>
        <p className="text-xs text-blue-600 mt-0.5">Comparing documents with AI — this takes a few seconds</p>
      </div>
    </div>
  );

  if (status === "failed") return (
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100">
      <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
      <div>
        <p className="font-semibold text-red-800 text-sm">Verification Failed</p>
        <p className="text-xs text-red-600 mt-0.5">{message}</p>
      </div>
    </div>
  );

  if (status === "passed") return (
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-100">
      <Check className="h-5 w-5 text-green-600 flex-shrink-0" />
      <div>
        <p className="font-semibold text-green-800 text-sm">Identity Verified ✓</p>
        <p className="text-xs text-green-600 mt-0.5">Name and face match confirmed</p>
      </div>
    </div>
  );

  return null;
};

export default function StepVerification({ booking, saveAndAdvance, updateMutation }) {
  const [uploads, setUploads] = useState({
    license_front_url: booking?.license_front_url || "",
    license_back_url: booking?.license_back_url || "",
    selfie_url: booking?.selfie_url || "",
    proof_of_income_url: booking?.proof_of_income_url || "",
  });
  const [uploading, setUploading] = useState({});
  const [verifyStatus, setVerifyStatus] = useState(null); // null | "checking" | "passed" | "failed"
  const [verifyMessage, setVerifyMessage] = useState("");
  const isRTO = booking?.booking_type === "Rent-to-Own";

  const handleUpload = async (field, file) => {
    if (!file) return;
    setUploading((p) => ({ ...p, [field]: true }));
    // Reset verification if re-uploading
    setVerifyStatus(null);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploads((p) => ({ ...p, [field]: file_url }));
    if (booking?.id) {
      updateMutation.mutate({ id: booking.id, data: { [field]: file_url } });
    }
    setUploading((p) => ({ ...p, [field]: false }));
  };

  const allUploaded = uploads.license_front_url && uploads.license_back_url && uploads.selfie_url;

  const runVerification = async () => {
    setVerifyStatus("checking");
    setVerifyMessage("");

    const profileName = (booking?.customer_full_name || "").trim().toLowerCase();

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an identity verification AI for a vehicle rental company.

You are given three images:
1. The FRONT of a government-issued driver's license or ID card
2. The BACK of that ID
3. A live selfie taken by the applicant right now

The applicant's name on file is: "${booking?.customer_full_name || "Unknown"}"
The applicant's address on file is: "${booking?.customer_address || "Unknown"}"

Perform these checks:
A) NAME MATCH: Extract the full name printed on the front of the ID card. Compare it to the applicant's name on file ("${booking?.customer_full_name || ""}"). They must match (minor spacing/middle name differences are OK, but first and last name must match).
B) ADDRESS MATCH: Extract the address printed on the driver's license (front or back). Compare it to the applicant's address on file ("${booking?.customer_address || ""}"). They must match on street number, street name, and city at minimum (minor formatting differences, abbreviations like St vs Street, or missing zip code are OK). If the address on file is blank or "Unknown", set address_match to true by default.
C) FACE MATCH: Compare the photo on the ID card to the live selfie. Determine if they appear to be the same person. Account for different lighting, angles, age differences up to 10 years. If the selfie and ID photo clearly show different people, it fails.

All three checks must pass for overall_pass to be true.

Respond ONLY with valid JSON:
{
  "name_on_id": "<extracted full name from ID>",
  "address_on_id": "<extracted address from ID>",
  "name_match": true/false,
  "address_match": true/false,
  "face_match": true/false,
  "overall_pass": true/false,
  "rejection_reason": "<if overall_pass is false, explain which check failed and why in one sentence; otherwise empty string>"
}`,
        file_urls: [uploads.license_front_url, uploads.license_back_url, uploads.selfie_url],
        response_json_schema: {
          type: "object",
          properties: {
            name_on_id: { type: "string" },
            address_on_id: { type: "string" },
            name_match: { type: "boolean" },
            address_match: { type: "boolean" },
            face_match: { type: "boolean" },
            overall_pass: { type: "boolean" },
            rejection_reason: { type: "string" },
          },
        },
      });

      if (result.overall_pass) {
        setVerifyStatus("passed");
        // Save verified name from ID for downstream use
        if (booking?.id) {
          updateMutation.mutate({
            id: booking.id,
            data: { verification_status: "verified", customer_full_name: booking.customer_full_name },
          });
        }
      } else {
        setVerifyStatus("failed");
        setVerifyMessage(result.rejection_reason || "Could not verify identity. Please retake your selfie or re-upload a clearer ID.");
        if (booking?.id) {
          updateMutation.mutate({ id: booking.id, data: { verification_status: "failed" } });
        }
      }
    } catch {
      setVerifyStatus("failed");
      setVerifyMessage("Verification service is temporarily unavailable. Please try again.");
    }
  };

  const handleContinue = () => {
    saveAndAdvance({
      ...uploads,
      verification_status: "verified",
    }, "terms");
  };

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
        <UploadBox label="Live Selfie" url={uploads.selfie_url} uploading={uploading.selfie_url}
          required onChange={(e) => handleUpload("selfie_url", e.target.files[0])} />
        {isRTO && (
          <UploadBox label="Proof of Income" url={uploads.proof_of_income_url} uploading={uploading.proof_of_income_url}
            onChange={(e) => handleUpload("proof_of_income_url", e.target.files[0])} />
        )}
      </div>

      {/* AI verification check info */}
      {allUploaded && verifyStatus === null && (
        <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100 flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">We'll verify your name matches your ID and your selfie matches your ID photo before proceeding.</p>
        </div>
      )}

      {/* Verification status */}
      {verifyStatus && (
        <div className="mt-4">
          <VerificationStatus status={verifyStatus} message={verifyMessage} />
        </div>
      )}

      <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100 flex gap-2">
        <AlertCircle className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">Your documents are encrypted and used only for rental verification. We do not store or share them beyond this purpose.</p>
      </div>

      {/* Verify button or Continue button */}
      {verifyStatus !== "passed" ? (
        <button
          disabled={!allUploaded || verifyStatus === "checking"}
          onClick={runVerification}
          className="w-full mt-5 py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {verifyStatus === "checking" ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</>
          ) : verifyStatus === "failed" ? (
            "Retry Verification"
          ) : (
            "Verify My Identity"
          )}
        </button>
      ) : (
        <button
          onClick={handleContinue}
          className="w-full mt-5 py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Continue →
        </button>
      )}
    </div>
  );
}