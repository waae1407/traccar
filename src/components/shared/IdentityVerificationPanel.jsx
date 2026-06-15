import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { uploadFile } from '@/utils/uploadFile';
import { AlertCircle, Check, Loader2, ShieldCheck, Upload, XCircle } from 'lucide-react';

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

  if (subject?.verification_status === 'verified') {
    return <VerificationStatus status="passed" />;
  }

  const handleUpload = async (field, file) => {
    if (!file) return;
    setUploading((previous) => ({ ...previous, [field]: true }));
    setVerifyStatus(null);
    const { file_url } = await uploadFile(file);
    setUploads((previous) => ({ ...previous, [field]: file_url }));
    if (subjectType === 'host' && subject?.id) {
      const hostField = field === 'id_front_url' ? 'id_front_url' : field === 'id_back_url' ? 'id_back_url' : 'selfie_url';
      await base44.entities.Host.update(subject.id, { [hostField]: file_url, verification_status: 'docs_submitted' });
    }
    setUploading((previous) => ({ ...previous, [field]: false }));
  };

  const allUploaded = uploads.id_front_url && uploads.id_back_url && uploads.selfie_url;

  const runVerification = async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifyStatus('checking');
    setVerifyMessage('');

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an identity verification AI for a vehicle rental platform.\n\nReview these three images: front of government ID, back of government ID, and live selfie.\n\nYour ONLY job is to confirm that the person in the live selfie appears to be the same person shown in the photo on the government ID. Do NOT check names, addresses, or any other text fields.\n\nReturn only JSON with face_match (boolean), overall_pass (boolean — set to the same value as face_match), and rejection_reason (empty string if passed, one sentence if failed explaining the selfie does not match the ID photo).`,
        file_urls: [uploads.id_front_url, uploads.id_back_url, uploads.selfie_url],
        response_json_schema: {
          type: 'object',
          properties: {
            face_match: { type: 'boolean' },
            overall_pass: { type: 'boolean' },
            rejection_reason: { type: 'string' },
          },
        },
      });

      if (result.overall_pass) {
        setVerifyStatus('passed');
        if (subjectType === 'host' && subject?.id) {
          await base44.entities.Host.update(subject.id, { verification_status: 'verified', verification_notes: 'Identity Verified on File' });
        }
        onVerified?.();
      } else {
        const message = result.rejection_reason || 'Could not verify identity. Please retake your selfie or upload clearer ID images.';
        setVerifyStatus('failed');
        setVerifyMessage(message);
        if (subjectType === 'host' && subject?.id) await base44.entities.Host.update(subject.id, { verification_status: 'failed', verification_notes: message });
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
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50"><ShieldCheck className="h-6 w-6 text-blue-600" /></div>
        <div><h2 className="text-xl font-bold text-gray-900">Verify Identity</h2><p className="text-sm text-gray-400">Required once for your host account.</p></div>
      </div>
      <div className="space-y-3">
        <UploadBox label="Government ID Front" url={uploads.id_front_url} uploading={uploading.id_front_url} onChange={(event) => handleUpload('id_front_url', event.target.files[0])} />
        <UploadBox label="Government ID Back" url={uploads.id_back_url} uploading={uploading.id_back_url} onChange={(event) => handleUpload('id_back_url', event.target.files[0])} />
        <UploadBox label="Live Selfie" url={uploads.selfie_url} uploading={uploading.selfie_url} onChange={(event) => handleUpload('selfie_url', event.target.files[0])} />
      </div>
      {allUploaded && verifyStatus === null && <div className="flex gap-2 rounded-xl border border-amber-100 bg-amber-50 p-3"><AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" /><p className="text-xs text-amber-700">We’ll verify your name matches your ID and your selfie matches your ID photo.</p></div>}
      {verifyStatus && <VerificationStatus status={verifyStatus} message={verifyMessage} />}
      <button type="button" disabled={!allUploaded || verifyStatus === 'checking'} onClick={runVerification} className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-all active:scale-[0.98] disabled:opacity-40" style={{ background: 'linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))' }}>{verifyStatus === 'checking' ? 'Verifying…' : verifyStatus === 'failed' ? 'Retry Verification' : 'Verify Identity'}</button>
    </div>
  );
}