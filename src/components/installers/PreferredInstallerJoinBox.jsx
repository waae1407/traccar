import React, { useState } from 'react';
import { Loader2, ShieldCheck } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import InstallerStatusBadge from './InstallerStatusBadge';

export default function PreferredInstallerJoinBox({ installResult, form }) {
  const record = installResult?.record || {};
  const [join, setJoin] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState({
    business_name: '',
    business_address: '',
    installer_email: record.assigned_installer_email || form?.installer_email || '',
    installer_phone: form?.installer_phone || ''
  });

  const submit = async () => {
    setLoading(true);
    const res = await base44.functions.invoke('submitPreferredInstallerInterest', {
      install_record_id: record.id,
      installer_name: record.installer_name || form?.installer_name,
      installer_signature_name: record.installer_signature_name || form?.installer_signature_name,
      ...fields
    });
    setSubmitted(res.data?.lead);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-left">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 text-emerald-600" />
          <div>
            <h3 className="font-black text-emerald-900">Thank you. Your installer profile has been added to the uRide Preferred Installer list.</h3>
            <div className="mt-3"><InstallerStatusBadge status={submitted.installer_status} count={submitted.verification_progress_count || 0} required={submitted.verification_required_count || 3} /></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-3xl border border-pink-100 bg-pink-50/70 p-5 text-left">
      <h3 className="text-xl font-black text-slate-950">Want More Installation Opportunities?</h3>
      <p className="mt-1 text-sm font-semibold text-slate-600">Join the uRide Preferred Installer Network and receive referrals from hosts looking for GPS and vehicle security installers near you.</p>
      <label className="mt-4 flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-black text-slate-900">
        <input type="checkbox" checked={join} onChange={e => setJoin(e.target.checked)} className="h-4 w-4" /> Join Preferred Installer Network
      </label>
      {join && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input placeholder="Business Name" value={fields.business_name} onChange={e => setFields(f => ({ ...f, business_name: e.target.value }))} className="h-12 rounded-2xl bg-white text-slate-950" />
          <Input placeholder="Business Address" value={fields.business_address} onChange={e => setFields(f => ({ ...f, business_address: e.target.value }))} className="h-12 rounded-2xl bg-white text-slate-950" />
          <Input placeholder="Email" value={fields.installer_email} onChange={e => setFields(f => ({ ...f, installer_email: e.target.value }))} className="h-12 rounded-2xl bg-white text-slate-950" />
          <Input placeholder="Phone" value={fields.installer_phone} onChange={e => setFields(f => ({ ...f, installer_phone: e.target.value }))} className="h-12 rounded-2xl bg-white text-slate-950" />
          <Button type="button" disabled={loading || !fields.business_name || !fields.business_address} onClick={submit} className="h-12 rounded-2xl bg-slate-950 font-black sm:col-span-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : 'Submit Installer Interest'}
          </Button>
        </div>
      )}
    </div>
  );
}