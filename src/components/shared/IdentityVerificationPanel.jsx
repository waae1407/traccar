import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { uploadFile } from '@/utils/uploadFile';
import { AlertCircle, Check, Loader2, Phone, ShieldCheck, Upload, User, XCircle } from 'lucide-react';

const inputCls = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400";

function UploadBox({ label, url, uploading, onChange }) {
  return (
    <div className={`relative rounded-2xl border-2 border-dashed p-4 transition-colors ${url ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
      <input type="file" accept="image/*" capture="environment" className="absolute inset-0 cursor-pointer opacity-0" onChange={onChange} />
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${url ? 'bg-green-100' : 'border border-gray-200 bg-white'}`}>
          {url ? <Check className="h-5 w-5 text-green-600" /> : <Upload className="h-5 w-5 text-gray-400" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-800">{label} <span className="text-pink-500">*</span></p>
          <p className="truncate text-xs text-gray-400">{uploading ? 'Uploading…' : url ? 'Uploaded ✓' : 'Tap to upload or take photo'}</p>
        </div>
      </div>
      {url && <img src={url} alt="" className="mt-3 h-20 w-full rounded-xl object-cover" />}
    </div>
  );
}

function VerificationStatus({ status, message }) {
  if (status === 'checking') return <div className="flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4"><Loader2 className="h-5 w-5 flex-shrink-0 animate-spin text-blue-500" /><div><p className="text-sm font-semibold text-blue-800">Verifying Identity…</p><p className="mt-0.5 text-xs text-blue-600">Comparing documents with AI — this takes a few seconds.</p></div></div>;
  if (status === 'failed') return <div className="flex items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-4"><XCircle className="h-5 w-5 flex-shrink-0 text-red-500" /><div><p className="text-sm font-semibold text-red-800">Verification Failed</p><p className="mt-0.5 text-xs text-red-600">{message}</p></div></div>;
  if (status === 'passed') return <div className="flex items-center gap-3 rounded-2xl border border-green-100 bg-green-50 p-4"><Check className="h-5 w-5 flex-shrink-0 text-green-600" /><div><p className="text-sm font-semibold text-green-800">Identity Verified on File</p><p className="mt-0.5 text-xs text-green-600">Name and face match confirmed.</p></div></div>;
  return null;
}

export default function IdentityVerificationPanel({ subjectType = 'host', subject, onVerified }) {
  const [uploads, setUploads] = useState({
    id_front_url: subject?.id_front_url || subject?.license_front_url || '',
    id_back_url: subject?.id_back_url || subject?.license_back_url || '',
    selfie_url: subject?.selfie_url || '',
  });
  const [uploading, setUploading] = useState({});
  const [verifyStatus, setVerifyStatus] = useState(subject?.verification_status === 'verified' ? 'passed' : null);
  const [verifyMessage, setVerifyMessage] = useState(subject?.verification_notes || '');
  const verifyingRef = useRef(false);

  // Legal name + phone — collected here so AI can do proper name match
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState(subject?.phone || '');
  const [savingInfo, setSavingInfo] = useState(false);

  if (subject?.verification_status === 'verified') {
    return <VerificationStatus status="passed" />;
  }

  const handleUpload = async (field, file) => {
    if (!file) return;
    setUploading((p) => ({ ...p, [field]: true }));
    setVerifyStatus(null);
    const { file_url } = await uploadFile(file);
    setUploads((p) => ({ ...p, [field]: file_url }));
    if (subjectType === 'host' && subject?.id) {
      await base44.entities.Host.update(subject.id, { [field]: file_url, verification_status: 'docs_submitted' });
    }
    setUploading((p) => ({ ...p, [field]: false }));
  };

  const legalNameEntered = firstName.trim() && lastName.trim();
  const allUploaded = uploads.id_front_url && uploads.id_back_url && uploads.selfie_url;
  const canVerify = allUploaded && legalNameEntered && phone.trim();

  const runVerification = async () => {
    if (verifyingRef.current || !canVerify) return;
    verifyingRef.current = true;
    setVerifyStatus('checking');
    setVerifyMessage('');

    const fullLegalName = [firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(' ');

    // Save legal name + phone to host before running AI
    if (subjectType === 'host' && subject?.id) {
      setSavingInfo(true);
      await base44.entities.Host.update(subject.id, {
        full_name: fullLegalName,
        phone: phone.trim(),
      }).catch(() => {});
      setSavingInfo(false);
    }

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert identity verification AI for a vehicle rental platform. You have deep experience recognizing the same person across varied photos.

The host's legal name on file is: "${fullLegalName}".

You are given three images: front of a government-issued ID, back of the ID, and a live selfie.

IMPORTANT IMAGE HANDLING RULES:
- Photos may be rotated 90° or 180°. Mentally correct for rotation before comparing.
- The selfie may be taken at an angle, lying down, or in low light — this is normal and should not cause a failure on its own.
- The ID photo may be small, dark, or lower resolution — focus on bone structure, not image quality.

FACE MATCH GUIDANCE — compare underlying facial structure, not surface appearance:
- Hairstyle, hair length, hair color, and hair texture can change drastically and should NOT be used as a rejection reason.
- Makeup, facial hair, weight changes, and lighting differences are expected and should not cause failure.
- Focus on: eye shape and spacing, nose shape, jawline, brow shape, cheekbones, and overall facial geometry.
- The ID photo may be years old. Allow for natural aging differences.
- If facial structure is consistent and there is no clear evidence of different people, lean toward a PASS.
- Only fail face_match if you have strong, clear evidence the faces belong to different individuals.

CHECK TWO THINGS:
1. NAME MATCH: Does the full name on the ID match "${fullLegalName}"? First and last name must match (middle name optional, minor spacing/order differences OK).
2. FACE MATCH: Using the guidance above, does the selfie show the same person as the ID photo?

Both must pass for overall_pass to be true.

Return only JSON: name_on_id (string), name_match (boolean), face_match (boolean), overall_pass (boolean), rejection_reason (empty string if passed, one clear sentence explaining specifically what structural feature differed if failed).`,
        file_urls: [uploads.id_front_url, uploads.id_back_url, uploads.selfie_url],
        response_json_schema: {
          type: 'object',
          properties: {
            name_on_id: { type: 'string' },
            name_match: { type: 'boolean' },
            face_match: { type: 'boolean' },
            overall_pass: { type: 'boolean' },
            rejection_reason: { type: 'string' },
          },
        },
      });

      if (result.overall_pass) {
        setVerifyStatus('passed');
        if (subjectType === 'host' && subject?.id) {
          await base44.entities.Host.update(subject.id, { verification_status: 'verified', verification_notes: 'Identity verified — name and face match confirmed.' });
        }
        onVerified?.();
      } else {
        const message = result.rejection_reason || 'Could not verify identity. Please ensure your name matches your ID exactly and retake your selfie in good lighting.';
        setVerifyStatus('failed');
        setVerifyMessage(message);
        if (subjectType === 'host' && subject?.id) {
          await base44.entities.Host.update(subject.id, { verification_status: 'failed', verification_notes: message });
        }
      }
    } catch {
      setVerifyStatus('failed');
      setVerifyMessage('Verification service is temporarily unavailable. Please try again.');
    } finally {
      verifyingRef.current = false;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Verify Identity</h2>
          <p className="text-sm text-gray-400">Required once for your host account.</p>
        </div>
      </div>

      {/* Legal name + phone */}
      <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3 shadow-sm">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" /> Legal Name — exactly as it appears on your ID
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input className={inputCls} placeholder="First name *" value={firstName} onChange={e => setFirstName(e.target.value)} />
          <input className={inputCls} placeholder="Middle name" value={middleName} onChange={e => setMiddleName(e.target.value)} />
        </div>
        <input className={inputCls} placeholder="Last name *" value={lastName} onChange={e => setLastName(e.target.value)} />
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 pt-1">
          <Phone className="h-3.5 w-3.5" /> Contact Phone Number
        </p>
        <input className={inputCls} placeholder="Phone number *" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        {!legalNameEntered && (
          <p className="text-xs text-amber-600 font-semibold">⚠ Enter your legal name exactly as it appears on your government ID before uploading.</p>
        )}
      </div>

      {/* ID + selfie uploads */}
      <div className="space-y-3">
        <UploadBox label="Government ID Front" url={uploads.id_front_url} uploading={uploading.id_front_url} onChange={(e) => handleUpload('id_front_url', e.target.files[0])} />
        <UploadBox label="Government ID Back" url={uploads.id_back_url} uploading={uploading.id_back_url} onChange={(e) => handleUpload('id_back_url', e.target.files[0])} />
        <UploadBox label="Live Selfie" url={uploads.selfie_url} uploading={uploading.selfie_url} onChange={(e) => handleUpload('selfie_url', e.target.files[0])} />
      </div>

      {canVerify && verifyStatus === null && (
        <div className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
          <p className="text-xs text-amber-700">We'll verify your name matches your ID and your selfie matches your ID photo.</p>
        </div>
      )}

      {verifyStatus && <VerificationStatus status={verifyStatus} message={verifyMessage} />}

      <button
        type="button"
        disabled={!canVerify || verifyStatus === 'checking' || savingInfo}
        onClick={runVerification}
        className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40"
        style={{ background: 'linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))' }}
      >
        {savingInfo ? 'Saving…' : verifyStatus === 'checking' ? 'Verifying…' : verifyStatus === 'failed' ? 'Retry Verification' : 'Verify Identity'}
      </button>
    </div>
  );
}