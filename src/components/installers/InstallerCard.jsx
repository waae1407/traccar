import React, { useEffect } from 'react';
import { Globe, Mail, MapPin, Navigation, Phone, ShieldCheck, Star } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import InstallerStatusBadge from './InstallerStatusBadge';

export default function InstallerCard({ installer, adminActions, source = 'locator' }) {
  const address = [installer.business_address, installer.business_city, installer.business_state, installer.business_zip].filter(Boolean).join(', ');
  const phone = installer.installer_phone || installer.phone;
  const website = installer.website;
  const directions = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}` : '';

  useEffect(() => {
    if (!installer?.id) return;
    base44.analytics.track({ eventName: 'installer_card_viewed', properties: { installer_id: installer.id, source } });
  }, [installer?.id, source]);

  const trackContact = (method) => base44.analytics.track({ eventName: 'installer_contact_clicked', properties: { installer_id: installer.id, method, source } });
  const trackDirections = () => base44.analytics.track({ eventName: 'installer_directions_clicked', properties: { installer_id: installer.id, source } });

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
        {installer.source === 'google_places' && <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">Found near you</span>}
        {installer.source !== 'google_places' && installer.location_verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"><ShieldCheck className="h-3 w-3" /> Location Verified</span>}
        {installer.claim_status === 'unclaimed' && <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">Unclaimed</span>}
        {!['verified', 'preferred'].includes(installer.installer_status) && <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">0/3 to 3/3 progress is based only on qualifying uRide installs.</span>}
        {['verified', 'preferred'].includes(installer.installer_status) && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">This installer has completed at least 3 successful uRide installation tests.</span>}
        {installer.google_rating > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700"><Star className="h-3 w-3 fill-current" /> {installer.google_rating.toFixed(1)} ({installer.google_review_count || 0})</span>}
      </div>

      {address && <p className="mt-3 text-sm text-slate-500">{address}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        {phone && <Button asChild size="sm" variant="outline" className="rounded-xl"><a href={`tel:${phone}`} onClick={() => trackContact('phone')}><Phone className="h-4 w-4" /> Call</a></Button>}
        {installer.installer_email && <Button asChild size="sm" variant="outline" className="rounded-xl"><a href={`mailto:${installer.installer_email}`} onClick={() => trackContact('email')}><Mail className="h-4 w-4" /> Email</a></Button>}
        {website && <Button asChild size="sm" variant="outline" className="rounded-xl"><a href={website} target="_blank" rel="noreferrer" onClick={() => trackContact('website')}><Globe className="h-4 w-4" /> Website</a></Button>}
        {directions && <Button asChild size="sm" className="rounded-xl bg-slate-950"><a href={directions} target="_blank" rel="noreferrer" onClick={trackDirections}><Navigation className="h-4 w-4" /> Directions</a></Button>}
        <Button size="sm" variant="outline" disabled className="rounded-xl opacity-60">Request Installation</Button>
        {adminActions}
      </div>
    </div>
  );
}