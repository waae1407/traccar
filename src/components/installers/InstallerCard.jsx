import React from 'react';
import { Mail, MapPin, Navigation, Phone, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import InstallerStatusBadge from './InstallerStatusBadge';

export default function InstallerCard({ installer, adminActions }) {
  const address = [installer.business_address, installer.business_city, installer.business_state, installer.business_zip].filter(Boolean).join(', ');
  const directions = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : '';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">{installer.business_name || installer.installer_name || 'Installer'}</h3>
          <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-slate-500"><MapPin className="h-4 w-4" />{[installer.business_city, installer.business_state].filter(Boolean).join(', ') || 'Location pending'}{installer.distance !== undefined ? ` · ${installer.distance.toFixed(1)} mi` : ''}</p>
        </div>
        <InstallerStatusBadge status={installer.installer_status} count={installer.verification_progress_count} required={installer.verification_required_count || 3} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {installer.location_verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"><ShieldCheck className="h-3 w-3" /> Location Verified</span>}
        {!['verified', 'preferred'].includes(installer.installer_status) && <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">This installer has not yet completed enough uRide installs to become verified.</span>}
        {['verified', 'preferred'].includes(installer.installer_status) && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">This installer has completed at least 3 successful uRide installation tests.</span>}
      </div>

      {address && <p className="mt-3 text-sm text-slate-500">{address}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {installer.installer_phone && <Button asChild size="sm" variant="outline" className="rounded-xl"><a href={`tel:${installer.installer_phone}`}><Phone className="h-4 w-4" /> Call</a></Button>}
        {installer.installer_email && <Button asChild size="sm" variant="outline" className="rounded-xl"><a href={`mailto:${installer.installer_email}`}><Mail className="h-4 w-4" /> Email</a></Button>}
        {directions && <Button asChild size="sm" className="rounded-xl bg-slate-950"><a href={directions} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Directions</a></Button>}
        {adminActions}
      </div>
    </div>
  );
}