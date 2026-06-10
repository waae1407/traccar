import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle } from 'lucide-react';

/**
 * Shows a banner when compliance enforcement is OFF.
 * variant="admin" → red critical banner with full detail
 * variant="host"  → yellow soft warning banner
 */
export default function ComplianceEnforcementBanner({ variant = 'admin' }) {
  const { data } = useQuery({
    queryKey: ['platform_settings'],
    queryFn: () => base44.functions.invoke('getPlatformSettings', {}).then(r => r.data),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // Default true — don't show banner if still loading or enforcement is on
  const enforcementEnabled = data ? data.compliance_enforcement_enabled !== false : true;
  if (enforcementEnabled) return null;

  if (variant === 'host') {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
        <span className="text-yellow-300">
          Compliance review is temporarily in testing mode. Some compliance warnings may not block vehicle setup.
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
      <span className="text-red-300 font-semibold">
        Compliance Enforcement OFF — testing mode active. Vehicles may be listed or booked without valid insurance/registration.{' '}
        <span className="font-bold underline">Turn this back ON before production.</span>
      </span>
    </div>
  );
}