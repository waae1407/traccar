import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

export default function NoranRetryLab() {

  const { data: commands, isLoading } = useQuery({
    queryKey: ['noran-reliability-commands'],
    queryFn: () => base44.asServiceRole.entities.TelematicsCommand.filter({ provider_key: 'traccar_noran_mt20', retry_enabled: true }, '-created_date', 100)
  });

  // Basic stats calculation (can be expanded)
  const stats = {
    total: commands?.length || 0,
    acknowledged: commands?.filter(c => c.status === 'acknowledged' || c.status === 'executed').length || 0,
    expired: commands?.filter(c => c.status === 'expired_no_heartbeat').length || 0,
    pending: commands?.filter(c => c.queue_status === 'pending_waiting_for_heartbeat').length || 0,
  };

  const successRate = stats.total > 0 ? (stats.acknowledged / stats.total) * 100 : 0;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Noran Command Reliability Lab</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <CardHeader><CardTitle>Total Commands</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Success Rate</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{successRate.toFixed(1)}%</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Pending Heartbeat</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.pending}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Expired (No Heartbeat)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{stats.expired}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Commands</CardTitle>
          <CardDescription>Heartbeat-delay release strategy</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Command</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delay (s)</TableHead>
                <TableHead>Actual Delay (s)</TableHead>
                <TableHead>ACK Delay (ms)</TableHead>
                <TableHead>Requested</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan="7">Loading...</TableCell></TableRow>
              ) : (commands || []).map(cmd => (
                <TableRow key={cmd.id}>
                  <TableCell>{cmd.command_type}</TableCell>
                  <TableCell>{cmd.device_unique_id}</TableCell>
                  <TableCell><Badge>{cmd.status}</Badge></TableCell>
                  <TableCell>{cmd.configured_post_heartbeat_release_delay_seconds}</TableCell>
                  <TableCell>{cmd.actual_heartbeat_to_release_delay_seconds}</TableCell>
                  <TableCell>{cmd.ack_delay_ms}</TableCell>
                  <TableCell>{new Date(cmd.created_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}