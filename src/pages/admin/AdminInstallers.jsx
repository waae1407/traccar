import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import InstallerCard from '@/components/installers/InstallerCard';
import InstallerLocatorMap from '@/components/installers/InstallerLocatorMap';
import InstallerStatusBadge from '@/components/installers/InstallerStatusBadge';
import { sortInstallers } from '@/lib/installers/installerLocatorUtils';

function norm(value) { return String(value || '').trim().toLowerCase(); }
function relatedRecords(records, lead) {
  return records.filter(record => {
    if (lead.installer_email && norm(record.installer_email || record.assigned_installer_email) === norm(lead.installer_email)) return true;
    if (lead.installer_phone && norm(record.installer_phone) === norm(lead.installer_phone)) return true;
    return norm(record.installer_name) && norm(record.installer_name) === norm(lead.installer_name);
  }).slice(0, 5);
}

export default function AdminInstallers() {
  const queryClient = useQueryClient();
  const { data: installers = [], isLoading } = useQuery({ queryKey: ['admin-installer-leads'], queryFn: () => base44.entities.PreferredInstallerLead.list('-updated_date', 500) });
  const { data: installRecords = [] } = useQuery({ queryKey: ['admin-installer-install-records'], queryFn: () => base44.entities.TelematicsInstallRecord.list('-installation_completed_at', 500) });
  const sorted = [...installers].sort(sortInstallers);

  const updateLead = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PreferredInstallerLead.update(id, { ...data, updated_at: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-installer-leads'] })
  });
  const refresh = useMutation({
    mutationFn: (lead) => base44.functions.invoke('recalculatePreferredInstallerProgress', { lead_id: lead.id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-installer-leads'] })
  });
  const excludeRecord = useMutation({
    mutationFn: ({ record, lead }) => base44.entities.TelematicsInstallRecord.update(record.id, { verification_excluded: true, verification_exclusion_reason: 'Excluded by admin' }).then(() => base44.functions.invoke('recalculatePreferredInstallerProgress', { lead_id: lead.id })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-installer-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admin-installer-install-records'] });
    }
  });

  const actions = (lead) => (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => updateLead.mutate({ id: lead.id, data: { lead_status: 'contacted' } })}>Mark Contacted</Button>
      <Button size="sm" variant="outline" onClick={() => updateLead.mutate({ id: lead.id, data: { lead_status: 'active' } })}>Mark Active</Button>
      <Button size="sm" variant="outline" onClick={() => updateLead.mutate({ id: lead.id, data: { installer_status: 'suspended' } })}>Suspend</Button>
      <Button size="sm" onClick={() => updateLead.mutate({ id: lead.id, data: { installer_status: 'preferred' } })}>Set Preferred</Button>
      <Button size="sm" variant="outline" onClick={() => refresh.mutate(lead)}>Refresh Progress</Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Admin</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">Installer Network Management</h1>
      </div>
      <InstallerLocatorMap installers={sorted} />
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        <div className="grid grid-cols-8 gap-3 border-b border-border p-4 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <span className="col-span-2">Installer</span><span>Status</span><span>Progress</span><span>Success</span><span>Failed</span><span>Location</span><span>Lead</span>
        </div>
        {isLoading ? <div className="p-8 text-center text-muted-foreground">Loading installers...</div> : sorted.map(lead => (
          <div key={lead.id} className="grid grid-cols-8 gap-3 border-b border-border p-4 text-sm last:border-b-0">
            <div className="col-span-2"><p className="font-black">{lead.business_name || lead.installer_name}</p><p className="text-xs text-muted-foreground">{lead.installer_email || lead.installer_phone}</p></div>
            <InstallerStatusBadge status={lead.installer_status} count={lead.verification_progress_count} required={lead.verification_required_count || 3} />
            <span>{lead.verification_progress_count || 0}/{lead.verification_required_count || 3}</span>
            <span>{lead.successful_install_count || 0} · {lead.success_rate || 0}%</span>
            <span>{lead.failed_install_count || 0}</span>
            <span>{lead.location_verified ? 'Verified' : 'Review'}</span>
            <span>{lead.lead_status || 'pending'}</span>
            <div className="col-span-8 space-y-3">
              <InstallerCard installer={lead} adminActions={actions(lead)} source="admin_installers" />
              <div className="rounded-2xl border border-border bg-background/40 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">Related install records</p>
                {relatedRecords(installRecords, lead).length === 0 ? <p className="text-xs text-muted-foreground">No matching install records yet.</p> : relatedRecords(installRecords, lead).map(record => (
                  <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-2 text-xs first:border-t-0">
                    <span>{record.vin || 'No VIN'} · {record.install_status} · {record.installation_completed_at ? new Date(record.installation_completed_at).toLocaleDateString() : 'No completion date'}</span>
                    <Button size="sm" variant="outline" disabled={record.verification_excluded} onClick={() => excludeRecord.mutate({ record, lead })}>{record.verification_excluded ? 'Excluded' : 'Exclude from count'}</Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}