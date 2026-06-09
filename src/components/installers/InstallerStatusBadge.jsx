import React from 'react';
import { Badge } from '@/components/ui/badge';

const LABELS = {
  listed: 'Listed Installer',
  not_verified: 'Listed Installer',
  in_progress: 'In Progress',
  almost_verified: 'Almost Verified',
  verified: 'uRide Verified',
  preferred: 'Preferred Installer',
  suspended: 'Suspended'
};

const STYLES = {
  listed: 'bg-slate-50 text-slate-700 border-slate-200',
  not_verified: 'bg-slate-100 text-slate-700 border-slate-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  almost_verified: 'bg-amber-50 text-amber-700 border-amber-200',
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  preferred: 'bg-primary text-white border-primary',
  suspended: 'bg-red-50 text-red-700 border-red-200'
};

export default function InstallerStatusBadge({ status, count = 0, required = 3 }) {
  const safeStatus = status || 'not_verified';
  const showProgress = !['preferred', 'suspended'].includes(safeStatus);
  return (
    <Badge variant="outline" className={`rounded-full px-3 py-1 text-xs font-black ${STYLES[safeStatus] || STYLES.not_verified}`}>
      {LABELS[safeStatus] || LABELS.not_verified}{showProgress ? ` · ${Math.min(count, required)}/${required} Verified Installs` : ''}
    </Badge>
  );
}