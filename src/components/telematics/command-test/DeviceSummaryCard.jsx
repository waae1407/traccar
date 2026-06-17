import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Satellite, Wifi, WifiOff, Activity, Clock, CheckCircle } from 'lucide-react';

export default function DeviceSummaryCard({ data }) {
  const queryClient = useQueryClient();
  const device = data?.device;
  const provider = data?.provider;
  const vehicle = data?.vehicle;

  const delayMutation = useMutation({
    mutationFn: (newDelay) => base44.asServiceRole.entities.TelematicsDevice.update(device.id, { post_heartbeat_release_delay_seconds: newDelay }),
    onSuccess: () => {
      toast.success('Release delay updated');
      queryClient.invalidateQueries({ queryKey: ['admin-command-test-history', device?.id] });
    },
    onError: (error) => {
      toast.error('Failed to update delay', { description: error.message });
    },
  });

  const handleDelayChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (isNaN(value) || value < 0 || value > 30) {
      toast.error('Invalid delay', { description: 'Must be 0-30 seconds.' });
      return;
    }
    delayMutation.mutate(value);
  };

  if (!device) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Device Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Device ID</p>
            <p className="font-mono text-sm">{device.unique_id}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Provider</p>
            <p className="text-sm">{provider?.provider_name || device.provider_key}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="flex items-center gap-2">
              {device.online_status === 'online' ? <Wifi className="h-4 w-4 text-green-500" /> : device.online_status === 'offline' ? <WifiOff className="h-4 w-4 text-red-500" /> : <Activity className="h-4 w-4 text-yellow-500" />}
              <Badge>{device.online_status}</Badge>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last Heartbeat</p>
            <p className="text-sm">{device.last_heartbeat_received_at ? new Date(device.last_heartbeat_received_at).toLocaleString() : 'N/A'}</p>
          </div>
        </div>

        {vehicle && (
          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground mb-1">Assigned Vehicle</p>
            <p className="text-sm font-medium">{vehicle.display_name || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}</p>
            <p className="text-xs text-muted-foreground">{vehicle.vin}</p>
          </div>
        )}

        {device.provider_key === 'traccar_noran_mt20' && device.production_commands_enabled && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold">Heartbeat Command Release</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="heartbeat-delay">Post-heartbeat release delay (seconds)</Label>
              <div className="flex gap-2">
                <Input 
                  id="heartbeat-delay" 
                  type="number" 
                  min="0" 
                  max="30" 
                  defaultValue={device.post_heartbeat_release_delay_seconds || 0}
                  onBlur={handleDelayChange}
                  className="max-w-xs"
                  disabled={delayMutation.isPending}
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => handleDelayChange({ target: { value: device.post_heartbeat_release_delay_seconds || 0 } })}
                  disabled={delayMutation.isPending}
                >
                  {delayMutation.isPending ? <Activity className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use 0 to release immediately after heartbeat. Test different delays to find optimal timing.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}