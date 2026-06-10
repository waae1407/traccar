import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, XCircle, Clock, Shield, ShieldOff } from 'lucide-react';
import { format } from 'date-fns';

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color || ''}`}>{value}</p>
      {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

function SBadge({ status }) {
  const m = { valid: 'bg-green-500/20 text-green-400', expiring_soon: 'bg-yellow-500/20 text-yellow-400', expired: 'bg-red-500/20 text-red-400', verified: 'bg-green-500/20 text-green-400', failed: 'bg-red-500/20 text-red-400', pending: 'bg-yellow-500/20 text-yellow-400', signed: 'bg-green-500/20 text-green-400', accepted: 'bg-green-500/20 text-green-400', submitted: 'bg-blue-500/20 text-blue-400', not_started: 'bg-muted text-muted-foreground' };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g,' ')}</Badge>;
}

export default function ComplianceCenter() {
  const qc = useQueryClient();
  const [togglingEnforcement, setTogglingEnforcement] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['compliance_center'],
    queryFn: () => base44.functions.invoke('getComplianceCenterMetrics', {}).then(r => r.data),
    refetchOnWindowFocus: false,
  });

  const { data: platformSettings } = useQuery({
    queryKey: ['platform_settings'],
    queryFn: () => base44.functions.invoke('getPlatformSettings', {}).then(r => r.data),
    refetchOnWindowFocus: false,
  });

  const enforcementEnabled = platformSettings ? platformSettings.compliance_enforcement_enabled !== false : true;

  const toggleEnforcement = async () => {
    setTogglingEnforcement(true);
    await base44.functions.invoke('getPlatformSettings', {
      action: 'set',
      key: 'compliance_enforcement_enabled',
      value_boolean: !enforcementEnabled,
      label: 'Compliance Enforcement',
      description: 'When ON, vehicles must have valid insurance and registration before they can be listed or booked. When OFF, missing compliance documents create warnings but do not block testing.',
    });
    await qc.invalidateQueries({ queryKey: ['platform_settings'] });
    await qc.invalidateQueries({ queryKey: ['compliance_center'] });
    setTogglingEnforcement(false);
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading Compliance Center…</div>;

  const kpis = data?.kpis;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Compliance Center</h1>
          <p className="text-muted-foreground text-sm mt-1">Vehicle docs · Host verification · Customer ID · Contracts · Inspections · Holds</p>
        </div>
        {/* Admin-only Compliance Enforcement Toggle */}
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${enforcementEnabled ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/40 bg-red-500/15'}`}>
          <div>
            <p className="text-xs font-semibold text-foreground flex items-center gap-1">
              {enforcementEnabled ? <Shield className="h-3 w-3 text-green-400" /> : <ShieldOff className="h-3 w-3 text-red-400" />}
              Compliance Enforcement
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {enforcementEnabled
                ? 'ON — vehicles require valid insurance & registration.'
                : 'OFF — missing docs warn but do not block.'}
            </p>
          </div>
          <button
            onClick={toggleEnforcement}
            disabled={togglingEnforcement}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${enforcementEnabled ? 'bg-green-500' : 'bg-red-500'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${enforcementEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* Critical banner when enforcement is OFF */}
      {!enforcementEnabled && (
        <Alert className="border-red-500/40 bg-red-500/15 py-3">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-300 text-sm font-semibold">
            ⚠️ Compliance enforcement is OFF. Vehicles may be listed or booked without valid insurance/registration. <strong>Turn this back ON before production.</strong>
          </AlertDescription>
        </Alert>
      )}

      {data?.warnings?.map((w, i) => <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2"><AlertTriangle className="h-3 w-3 text-yellow-400" /><AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription></Alert>)}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Docs" value={kpis?.total_docs || 0} />
        <MetricCard label="Expired" value={kpis?.expired_count || 0} color="text-red-400" />
        <MetricCard label="Expiring Soon" value={kpis?.expiring_soon_count || 0} color="text-yellow-400" />
        <MetricCard label="Compliance Holds" value={kpis?.compliance_hold_count || 0} color="text-red-400" />
        <MetricCard label="Hosts Verified" value={kpis?.host_verified_count || 0} color="text-green-400" />
        <MetricCard label="Customers Verified" value={kpis?.customer_verified_count || 0} color="text-green-400" />
      </div>

      <Tabs defaultValue="expiring">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['expiring','Expiring Soon'],['expired','Expired'],['holds','Holds'],['host_verify','Host Verification'],['customer_verify','Customer Verification'],['contracts','Contracts'],['inspections','Inspections'],['all_docs','All Documents']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="expiring" className="mt-4 space-y-2">
          {data?.vehicle_documents?.expiring_soon?.map(d => (
            <div key={d.id} className="flex justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{d.doc_type?.replace(/_/g,' ')} — {d.vehicle_name || d.vehicle?.make}</p>
                <p className="text-muted-foreground text-xs">Expires: {d.expiry_date} ({d.days_until_expiry} days)</p>
                {!d.expiry_date && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Missing expiry date</Badge>}
              </div>
              <SBadge status={d.status} />
            </div>
          ))}
          {!data?.vehicle_documents?.expiring_soon?.length && <p className="text-muted-foreground text-sm">No documents expiring soon.</p>}
        </TabsContent>

        <TabsContent value="expired" className="mt-4 space-y-2">
          {data?.vehicle_documents?.expired?.map(d => (
            <div key={d.id} className="flex justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{d.doc_type?.replace(/_/g,' ')} — {d.vehicle_name || d.vehicle?.make}</p>
                <p className="text-muted-foreground text-xs">Expired: {d.expiry_date}</p>
              </div>
              <SBadge status="expired" />
            </div>
          ))}
          {!data?.vehicle_documents?.expired?.length && <p className="text-muted-foreground text-sm">No expired documents.</p>}
        </TabsContent>

        <TabsContent value="holds" className="mt-4 space-y-2">
          {data?.compliance_holds?.map(v => (
            <div key={v.id} className="flex justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div><p className="font-medium">{v.year} {v.make} {v.model}</p><p className="text-muted-foreground text-xs">Approval: {v.approval_status}</p></div>
              <Badge className="bg-red-500/20 text-red-400 text-xs">{v.status}</Badge>
            </div>
          ))}
          {!data?.compliance_holds?.length && <p className="text-muted-foreground text-sm">No compliance holds.</p>}
        </TabsContent>

        <TabsContent value="host_verify" className="mt-4 space-y-2">
          <div className="grid grid-cols-4 gap-3 mb-4">
            <MetricCard label="Verified" value={data?.host_verification?.verified || 0} color="text-green-400" />
            <MetricCard label="Unverified" value={data?.host_verification?.unverified || 0} color="text-red-400" />
            <MetricCard label="Pending" value={data?.host_verification?.pending || 0} color="text-yellow-400" />
            <MetricCard label="Failed" value={data?.host_verification?.failed || 0} color="text-red-400" />
          </div>
          {data?.host_verification?.hosts?.map(h => (
            <div key={h.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div><p className="font-medium">{h.full_name}</p><p className="text-muted-foreground text-xs">{h.email}</p></div>
              <SBadge status={h.verification_status || 'not_started'} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="customer_verify" className="mt-4 space-y-2">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MetricCard label="Verified" value={data?.customer_verification?.verified || 0} color="text-green-400" />
            <MetricCard label="Unverified" value={data?.customer_verification?.unverified || 0} color="text-red-400" />
            <MetricCard label="Manual Review" value={data?.customer_verification?.manual_review || 0} color="text-yellow-400" />
          </div>
        </TabsContent>

        <TabsContent value="contracts" className="mt-4 space-y-2">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetricCard label="Signed" value={data?.contracts?.signed || 0} color="text-green-400" />
            <MetricCard label="Unsigned (active)" value={data?.contracts?.unsigned || 0} color="text-yellow-400" />
          </div>
          <h3 className="text-sm font-semibold text-muted-foreground mt-4">Contract Templates</h3>
          {data?.contracts?.templates?.map(t => (
            <div key={t.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div><p className="font-medium">{t.name}</p><p className="text-muted-foreground text-xs">{t.template_type?.replace(/_/g,' ')} · v{t.version}</p></div>
              <SBadge status={t.status} />
            </div>
          ))}
        </TabsContent>

        <TabsContent value="inspections" className="mt-4 space-y-2">
          {data?.inspections?.all?.slice(0, 30).map(i => (
            <div key={i.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{i.inspection_type?.replace(/_/g,' ')} — by {i.submitted_by_role}</p>
                <p className="text-muted-foreground text-xs">{i.submitted_at ? format(new Date(i.submitted_at), 'MMM d, yyyy') : '—'} · Confidence: {i.evidence_confidence}</p>
              </div>
              <SBadge status={i.evidence_status} />
            </div>
          ))}
          {!data?.inspections?.all?.length && <p className="text-muted-foreground text-sm">No inspections found.</p>}
        </TabsContent>

        <TabsContent value="all_docs" className="mt-4 space-y-2">
          {data?.vehicle_documents?.all?.slice(0, 50).map(d => (
            <div key={d.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div>
                <p className="font-medium">{d.doc_type?.replace(/_/g,' ')} — {d.vehicle_name}</p>
                <p className="text-muted-foreground text-xs">Expires: {d.expiry_date || '—'}</p>
                {!d.expiry_date && <Badge className="bg-yellow-500/20 text-yellow-400 text-xs">Missing expiry</Badge>}
              </div>
              <SBadge status={d.status} />
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}