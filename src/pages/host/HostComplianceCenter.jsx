import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
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
  const m = { valid: 'bg-green-500/20 text-green-400', expiring_soon: 'bg-yellow-500/20 text-yellow-400', expired: 'bg-red-500/20 text-red-400', signed: 'bg-green-500/20 text-green-400', submitted: 'bg-blue-500/20 text-blue-400', not_started: 'bg-muted text-muted-foreground' };
  return <Badge className={m[status] || 'bg-muted text-muted-foreground text-xs'}>{status?.replace(/_/g,' ')}</Badge>;
}

export default function HostComplianceCenter() {
  const { data, isLoading } = useQuery({
    queryKey: ['host_compliance_center'],
    queryFn: () => base44.functions.invoke('getComplianceCenterMetrics', {}).then(r => r.data),
    refetchOnWindowFocus: false,
  });

  if (isLoading) return <div className="p-8 flex items-center gap-3 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading compliance…</div>;

  const kpis = data?.kpis;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Compliance Center</h1>
        <p className="text-muted-foreground text-sm mt-1">Your vehicle documents · Expiring docs · Compliance holds · Inspections</p>
      </div>

      {data?.warnings?.filter(w => !w.includes('CRITICAL') && !w.includes('enforcement')).map((w, i) => (
        <Alert key={i} className="border-yellow-500/30 bg-yellow-500/10 py-2">
          <AlertTriangle className="h-3 w-3 text-yellow-400" />
          <AlertDescription className="text-yellow-300 text-xs">{w}</AlertDescription>
        </Alert>
      ))}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Docs" value={kpis?.total_docs || 0} />
        <MetricCard label="Expired" value={kpis?.expired_count || 0} color="text-red-400" />
        <MetricCard label="Expiring Soon" value={kpis?.expiring_soon_count || 0} color="text-yellow-400" />
        <MetricCard label="Compliance Holds" value={kpis?.compliance_hold_count || 0} color="text-red-400" />
      </div>

      <Tabs defaultValue="expiring">
        <TabsList className="flex-wrap h-auto gap-1">
          {[['expiring','Expiring Soon'],['expired','Expired'],['holds','Holds'],['inspections','Inspections'],['all_docs','All Documents']].map(([v,l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="expiring" className="mt-4 space-y-2">
          {data?.vehicle_documents?.expiring_soon?.map(d => (
            <div key={d.id} className="flex justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm">
              <div><p className="font-medium">{d.doc_type?.replace(/_/g,' ')} — {d.vehicle_name || d.vehicle?.make}</p><p className="text-muted-foreground text-xs">Expires: {d.expiry_date} ({d.days_until_expiry} days)</p></div>
              <SBadge status={d.status} />
            </div>
          ))}
          {!data?.vehicle_documents?.expiring_soon?.length && <p className="text-muted-foreground text-sm">No documents expiring soon.</p>}
        </TabsContent>

        <TabsContent value="expired" className="mt-4 space-y-2">
          {data?.vehicle_documents?.expired?.map(d => (
            <div key={d.id} className="flex justify-between rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm">
              <div><p className="font-medium">{d.doc_type?.replace(/_/g,' ')} — {d.vehicle_name || d.vehicle?.make}</p><p className="text-muted-foreground text-xs">Expired: {d.expiry_date}</p></div>
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

        <TabsContent value="inspections" className="mt-4 space-y-2">
          {data?.inspections?.all?.slice(0, 30).map(i => (
            <div key={i.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div><p className="font-medium">{i.inspection_type?.replace(/_/g,' ')} — by {i.submitted_by_role}</p><p className="text-muted-foreground text-xs">{i.submitted_at ? format(new Date(i.submitted_at), 'MMM d, yyyy') : '—'}</p></div>
              <SBadge status={i.evidence_status} />
            </div>
          ))}
          {!data?.inspections?.all?.length && <p className="text-muted-foreground text-sm">No inspections found.</p>}
        </TabsContent>

        <TabsContent value="all_docs" className="mt-4 space-y-2">
          {data?.vehicle_documents?.all?.slice(0, 50).map(d => (
            <div key={d.id} className="flex justify-between rounded-lg bg-secondary/30 px-3 py-2 text-sm">
              <div><p className="font-medium">{d.doc_type?.replace(/_/g,' ')} — {d.vehicle_name}</p><p className="text-muted-foreground text-xs">Expires: {d.expiry_date || '—'}</p></div>
              <SBadge status={d.status} />
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}