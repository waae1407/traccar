import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Check, AlertCircle, ShieldCheck, Loader2, XCircle, RefreshCw } from "lucide-react";
import { uploadFile } from "@/utils/uploadFile";
import usePersistentFormDraft from "@/hooks/usePersistentFormDraft";

// Per-document upload status: idle | uploading | uploaded | failed | retrying
function UploadBox({ label, url, status, error, onChange, onRetry, onClear, required }) {
  const isUploading = status === "uploading" || status === "retrying";
  const isFailed = status === "failed";
  const isUploaded = status === "uploaded" || !!url;

  return (
    <div className={`relative border-2 border-dashed rounded-2xl p-4 transition-colors ${
      isUploaded ? "border-green-300 bg-green-50" :
      isFailed ? "border-red-300 bg-red-50" :
      isUploading ? "border-blue-200 bg-blue-50/50" :
      "border-gray-200 bg-gray-50"
    }`}>
      {/* Clickable file input — disabled while uploading */}
      {!isUploading && (
        <input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
          capture="environment"
          className="absolute inset-0 opacity-0 cursor-pointer z-10"
          onChange={onChange}
        />
      )}

      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isUploaded ? "bg-green-100" :
          isFailed ? "bg-red-100" :
          isUploading ? "bg-blue-100" :
          "bg-white border border-gray-200"
        }`}>
          {isUploading ? (
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          ) : isUploaded ? (
            <Check className="h-5 w-5 text-green-600" />
          ) : isFailed ? (
            <XCircle className="h-5 w-5 text-red-500" />
          ) : (
            <Upload className="h-5 w-5 text-gray-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm">
            {label} {required && <span className="text-pink-500">*</span>}
          </p>
          <p className={`text-xs truncate ${
            isUploading ? "text-blue-500" :
            isUploaded ? "text-green-600" :
            isFailed ? "text-red-500" :
            "text-gray-400"
          }`}>
            {status === "retrying" ? "Retrying upload…" :
             isUploading ? "Uploading…" :
             isUploaded ? "Uploaded ✓" :
             isFailed ? "Upload failed" :
             "Tap to upload or take photo"}
          </p>
        </div>

        {/* Retry / Clear buttons for failed */}
        {isFailed && (
          <div className="flex gap-1.5 z-20 relative">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRetry?.(); }}
              className="px-2 py-1 rounded-lg bg-red-100 text-red-600 text-xs font-semibold flex items-center gap-1 hover:bg-red-200 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClear?.(); }}
              className="px-2 py-1 rounded-lg bg-gray-100 text-gray-500 text-xs font-semibold hover:bg-gray-200 transition-colors"
            >
              ✕
            </button>
          </div>
        )}

        {/* Clear uploaded file */}
        {isUploaded && !isUploading && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear?.(); }}
            className="z-20 relative px-2 py-1 rounded-lg bg-gray-100 text-gray-400 text-xs hover:bg-gray-200 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Error message */}
      {isFailed && error && (
        <div className="mt-2 flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Image preview */}
      {isUploaded && url && (
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

// Maps error codes to user-friendly messages
function friendlyUploadError(err) {
  const code = err?.code;
  if (code === "FILE_TOO_LARGE") return err.message;
  if (code === "UNSUPPORTED_FORMAT") return err.message;
  if (code === "UPLOAD_TIMEOUT") return "Upload timed out. Please check your connection and tap Retry.";
  if (code === "READ_TIMEOUT") return "Could not read the file. Please try again.";
  if (code === "READ_ERROR") return "Could not open the file. Please try a different photo.";
  if (code === "STORAGE_FAILED") return "Storage error. Please tap Retry.";
  return "Upload failed. Please tap Retry. If this continues, contact support. (ERR-UPL-001)";
}

const UPLOAD_FIELDS = ["license_front_url", "license_back_url", "selfie_url", "proof_of_income_url"];

export default function StepVerification({ booking, saveAndAdvance, updateMutation }) {
  const draftKey = booking?.id ? `checkout_verification_draft:${booking.id}` : null;
  const [draftUploads, setDraftUploads, clearVerificationDraft] = usePersistentFormDraft(
    draftKey || "__noop__",
    { license_front_url: "", license_back_url: "", selfie_url: "", proof_of_income_url: "" },
    { enabled: !!booking?.id }
  );

  // Always prefer values saved on the booking record over the local draft.
  const uploads = {
    license_front_url: booking?.license_front_url || draftUploads.license_front_url || "",
    license_back_url: booking?.license_back_url || draftUploads.license_back_url || "",
    selfie_url: booking?.selfie_url || draftUploads.selfie_url || "",
    proof_of_income_url: booking?.proof_of_income_url || draftUploads.proof_of_income_url || "",
  };

  // Per-document statuses: idle | uploading | uploaded | failed | retrying
  const initialStatuses = Object.fromEntries(
    UPLOAD_FIELDS.map((f) => [f, uploads[f] ? "uploaded" : "idle"])
  );
  const [uploadStatuses, setUploadStatuses] = useState(initialStatuses);
  const [uploadErrors, setUploadErrors] = useState({});

  const [verifyStatus, setVerifyStatus] = useState(null);
  const [verifyMessage, setVerifyMessage] = useState("");
  const isRTO = booking?.booking_type === "Rent-to-Own";
  const verifyingRef = useRef(false);

  // Auto-set passed if already verified on booking
  React.useEffect(() => {
    if (booking?.verification_status === "verified") {
      setVerifyStatus("passed");
    }
  }, [booking?.id, booking?.verification_status]);

  // Sync upload statuses when booking data loads (e.g. returning to step)
  React.useEffect(() => {
    setUploadStatuses((prev) => {
      const next = { ...prev };
      UPLOAD_FIELDS.forEach((f) => {
        if (uploads[f] && prev[f] === "idle") next[f] = "uploaded";
      });
      return next;
    });
  }, [booking?.id]); // eslint-disable-line

  const setFieldStatus = (field, status) =>
    setUploadStatuses((p) => ({ ...p, [field]: status }));
  const setFieldError = (field, msg) =>
    setUploadErrors((p) => ({ ...p, [field]: msg }));
  const clearFieldError = (field) =>
    setUploadErrors((p) => ({ ...p, [field]: "" }));

  const doUpload = async (field, file) => {
    if (!file) return;

    setFieldStatus(field, "uploading");
    clearFieldError(field);
    setVerifyStatus(null); // reset verification when any file changes

    try {
      const { file_url } = await uploadFile(file);
      setDraftUploads((p) => ({ ...p, [field]: file_url }));
      if (booking?.id) {
        updateMutation.mutate({ id: booking.id, data: { [field]: file_url } });
      }
      setFieldStatus(field, "uploaded");
    } catch (err) {
      console.error(`[StepVerification] upload failed for ${field}:`, err);
      setFieldStatus(field, "failed");
      setFieldError(field, friendlyUploadError(err));

      // Log failure to ActivityEvent for admin/support visibility
      base44.entities.ActivityEvent.create({
        event_type: "upload_failed",
        actor_id: booking?.user_id || "unknown",
        actor_email: booking?.user_email || "unknown",
        target_entity: "BookingRequest",
        target_id: booking?.id || "unknown",
        booking_request_id: booking?.id,
        summary: `ID document upload failed — field: ${field}, error: ${err.code || "unknown"}: ${err.message}`,
        metadata: {
          field,
          error_code: err.code || "UNKNOWN",
          error_message: err.message,
          file_name: file?.name,
          file_size: file?.size,
          file_type: file?.type,
          step: "verification",
          user_agent: navigator.userAgent,
        },
        source: "checkout",
        event_status: "failed",
      }).catch(() => {}); // fire and forget
    }
  };

  const handleFileChange = (field) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input value so re-selecting the same file triggers onChange
    e.target.value = "";
    doUpload(field, file);
  };

  const handleRetry = (field) => {
    // Open file picker by clicking a hidden input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/jpg,image/png,image/webp,application/pdf";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        setFieldStatus(field, "retrying");
        doUpload(field, file);
      }
    };
    input.click();
  };

  const handleClear = (field) => {
    setDraftUploads((p) => ({ ...p, [field]: "" }));
    setFieldStatus(field, "idle");
    clearFieldError(field);
    setVerifyStatus(null);
    if (booking?.id) {
      updateMutation.mutate({ id: booking.id, data: { [field]: "" } });
    }
  };

  const currentUploads = {
    license_front_url: draftUploads.license_front_url || booking?.license_front_url || "",
    license_back_url: draftUploads.license_back_url || booking?.license_back_url || "",
    selfie_url: draftUploads.selfie_url || booking?.selfie_url || "",
    proof_of_income_url: draftUploads.proof_of_income_url || booking?.proof_of_income_url || "",
  };

  const anyUploading = Object.values(uploadStatuses).some(
    (s) => s === "uploading" || s === "retrying"
  );
  const anyFailed = Object.values(uploadStatuses).some((s) => s === "failed");
  const allRequired = currentUploads.license_front_url &&
    currentUploads.license_back_url &&
    currentUploads.selfie_url;

  const canVerify = allRequired && !anyUploading && !anyFailed && verifyStatus !== "checking";

  const runVerification = async () => {
    if (verifyingRef.current || !canVerify) return;
    verifyingRef.current = true;
    setVerifyStatus("checking");
    setVerifyMessage("");

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
        file_urls: [currentUploads.license_front_url, currentUploads.license_back_url, currentUploads.selfie_url],
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
        if (booking?.id) {
          updateMutation.mutate({
            id: booking.id,
            data: { verification_status: "verified", customer_full_name: booking.customer_full_name },
          });
        }
      } else {
        setVerifyStatus("failed");
        setVerifyMessage(
          result.rejection_reason ||
          "We could not verify this document. Please retake the photo in good lighting and try again."
        );
        if (booking?.id) {
          updateMutation.mutate({ id: booking.id, data: { verification_status: "failed" } });
        }
      }
    } catch {
      setVerifyStatus("failed");
      setVerifyMessage("Verification service is temporarily unavailable. Please try again in a moment.");
    } finally {
      verifyingRef.current = false;
    }
  };

  const handleContinue = () => {
    clearVerificationDraft();
    saveAndAdvance({
      ...currentUploads,
      verification_status: "verified",
    }, "terms");
  };

  const fields = [
    { key: "license_front_url", label: "Driver's License (Front)", required: true },
    { key: "license_back_url", label: "Driver's License (Back)", required: true },
    { key: "selfie_url", label: "Live Selfie", required: true },
    ...(isRTO ? [{ key: "proof_of_income_url", label: "Proof of Income", required: false }] : []),
  ];

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
        {fields.map(({ key, label, required }) => (
          <UploadBox
            key={key}
            label={label}
            url={currentUploads[key]}
            status={uploadStatuses[key]}
            error={uploadErrors[key]}
            required={required}
            onChange={handleFileChange(key)}
            onRetry={() => handleRetry(key)}
            onClear={() => handleClear(key)}
          />
        ))}
      </div>

      {/* Pending upload warning */}
      {anyUploading && (
        <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100 flex gap-2">
          <Loader2 className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5 animate-spin" />
          <p className="text-xs text-blue-700">Upload in progress — please wait before verifying.</p>
        </div>
      )}

      {/* Failed upload warning */}
      {anyFailed && !anyUploading && (
        <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100 flex gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">
            One or more uploads failed. Tap <strong>Retry</strong> on the failed item above, or tap <strong>✕</strong> to upload a different file.
          </p>
        </div>
      )}

      {/* AI verification info */}
      {allRequired && !anyUploading && !anyFailed && verifyStatus === null && (
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

      {/* Verify / Continue button */}
      {verifyStatus !== "passed" ? (
        <button
          disabled={!canVerify}
          onClick={runVerification}
          className="w-full mt-5 py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          {verifyStatus === "checking" ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Verifying…</>
          ) : anyUploading ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</>
          ) : anyFailed ? (
            "Fix upload errors above to continue"
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
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
        >
          Continue →
        </button>
      )}
    </div>
  );
}