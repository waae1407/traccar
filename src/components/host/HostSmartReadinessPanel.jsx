import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, Circle, Copy, ExternalLink, Car, ArrowRight } from 'lucide-react';

const statusStyles = {
  Done: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  Needed: 'bg-amber-50 text-amber-700 border-amber-100',
  Optional: 'bg-blue-50 text-blue-700 border-blue-100',
  Blocked: 'bg-gray-100 text-gray-600 border-gray-200',
  Skipped: 'bg-slate-50 text-slate-500 border-slate-200',
};

function ReadinessIcon({ status }) {
  if (status === 'Done') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === 'Blocked') return <AlertTriangle className="h-4 w-4 text-gray-500" />;
  return <Circle className="h-4 w-4 text-amber-500" />;
}

function ReadinessRow({ label, item }) {
  const state = item?.status || 'Needed';
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-3">
      <div className="flex items-center gap-2 min-w-0">
        <ReadinessIcon status={state} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{label}</p>
          {item?.detail && <p className="text-xs text-gray-500 truncate">{item.detail}</p>}
        </div>
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusStyles[state] || statusStyles.Needed}`}>{state}</span>
    </div>
  );
}

export default function HostSmartReadinessPanel({ readiness, storeUrl }) {
  const [copied, setCopied] = useState(false);
  const absoluteStoreUrl = storeUrl ? `${window.location.origin}${storeUrl}` : '';

  const copyLink = async () => {
    if (!absoluteStoreUrl) return;
    await navigator.clipboard.writeText(absoluteStoreUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const items = [
    ['Storefront live', readiness?.storefront_status],
    ['Add vehicle', readiness?.vehicle_details_status],
    ['Vehicle registration', readiness?.registration_status],
    ['Vehicle insurance', readiness?.insurance_status],
    ['Host ID verification', readiness?.host_identity_status],
    ['Plan / trial status', readiness?.subscription_status],
    ['Stripe setup', readiness?.payment_setup_status],
    ['GPS setup', readiness?.gps_status],
    ['Publish vehicle', readiness?.publish_status],
  ];

  return (
    <section className="overflow-hidden rounded-[2rem] border border-pink-100 bg-white shadow-sm">
      <div className="relative p-5 sm:p-6" style={{ background: 'linear-gradient(135deg, #fff 0%, #fff5fb 55%, #f5f3ff 100%)' }}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pink-500">Next step</p>
            <h2 className="mt-1 text-2xl font-black text-gray-950" style={{ fontFamily: 'var(--font-syne)' }}>Get Your First Vehicle Live</h2>
            <p className="mt-2 text-sm text-gray-600">Your storefront is live. Add a vehicle and we’ll guide you through what’s needed.</p>
            {absoluteStoreUrl && (
              <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Your storefront is live:</p>
                <p className="mt-1 break-all font-mono text-sm font-bold text-emerald-950">{absoluteStoreUrl}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a href={storeUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><ExternalLink className="h-3.5 w-3.5" /> View Storefront</a>
                  <button type="button" onClick={copyLink} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800"><Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy Storefront Link'}</button>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <Link to="/host/vehicles/setup" className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-lg" style={{ background: 'linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))' }}><Car className="h-4 w-4" /> Add First Vehicle</Link>
            <Link to="/host/vehicles/setup" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-black text-gray-800">Continue Setup <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.map(([label, item]) => <ReadinessRow key={label} label={label} item={item} />)}
        </div>
      </div>
    </section>
  );
}