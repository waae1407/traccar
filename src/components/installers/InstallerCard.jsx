import React, { useEffect } from 'react';
import { Globe, MapPin, Navigation, Phone, ShieldCheck, Star } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import InstallerStatusBadge from './InstallerStatusBadge';

function sourceLabel(source) {
  if (source === 'google_places') return 'Google Listed';
  if (source === 'install_completion') return 'uRide Install Record';
  if (source === 'admin_created') return 'Admin Added';
  return '';
}

function websiteHref(value) {
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export default function InstallerCard({ installer, adminActions, source = 'locator' }) {
  const address = [installer.business_address, installer.business_city, installer.business_state, installer.business_zip].filter(Boolean).join(', ');
  const phone = installer.installer_phone || installer.phone;
  const website = websiteHref(installer.website);
  const latitude = installer.business_latitude ?? installer.latitude ?? installer.lat;
  const longitude = installer.business_longitude ?? installer.longitude ?? installer.lng ?? installer.lon;
  const hasCoordinates = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const directionsDestination = address || (hasCoordinates ? `${latitude},${longitude}` : '');
  const directions = directionsDestination ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(directionsDestination)}` : '';
  const listingSource = sourceLabel(installer.source);

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
        {listingSource && <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">{listingSource}</span>}
        {installer.source !== 'google_places' && installer.location_verified && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700"><ShieldCheck className="h-3 w-3" /> Location Verified</span>}
        {installer.claim_status === 'unclaimed' && <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700">Unclaimed</span>}
        {!['verified', 'preferred'].includes(installer.installer_status) && <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">Complete 3 successful uRide installs to become Verified.</span>}
        {['verified', 'preferred'].includes(installer.installer_status) && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Verified through successful uRide installs.</span>}
        {installer.google_rating > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700"><Star className="h-3 w-3 fill-current" /> {installer.google_rating.toFixed(1)} ({installer.google_review_count || 0})</span>}
      </div>

      {address && <p className="mt-3 text-sm text-slate-500">{address}</p>}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {phone && <Button asChild size="sm" variant="outline" className="min-h-11 flex-1 rounded-xl border-slate-300 bg-white px-4 font-black text-slate-950 shadow-sm hover:bg-slate-50 sm:flex-none"><a href={`tel:${phone}`} onClick={() => trackContact('phone')}><Phone className="h-4 w-4" /> Call</a></Button>}
        {website && <Button asChild size="sm" variant="outline" className="min-h-11 flex-1 rounded-xl border-slate-300 bg-white px-4 font-black text-slate-950 shadow-sm hover:bg-slate-50 sm:flex-none"><a href={website} target="_blank" rel="noreferrer" onClick={() => trackContact('website')}><Globe className="h-4 w-4" /> Website</a></Button>}
        {directions && <Button asChild size="sm" className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 font-black text-white shadow-sm hover:bg-slate-800 sm:flex-none"><a href={directions} target="_blank" rel="noreferrer" onClick={trackDirections}><Navigation className="h-4 w-4" /> Directions</a></Button>}
        {adminActions}
      </div>
    </div>
  );
}