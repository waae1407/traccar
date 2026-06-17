import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const TelematicsDeviceVerification = ({ deviceId }) => {
  const queryClient = useQueryClient();
  const [delay, setDelay] = useState(0);

  const { data: device } = useQuery({
    queryKey: ['telematicsDevice', deviceId],
    queryFn: () => base44.asServiceRole.entities.TelematicsDevice.filter({ id: deviceId }).then(d => d[0]),
    enabled: !!deviceId,
  });

  useEffect(() => {
    if (device) {
      setDelay(device.post_heartbeat_release_delay_seconds || 0);
    }
  }, [device]);

  const mutation = useMutation({
    mutationFn: (newDelay) => base44.asServiceRole.entities.TelematicsDevice.update(deviceId, { post_heartbeat_release_delay_seconds: newDelay }),
    onSuccess: () => {
      toast.success('Release delay updated');
      queryClient.invalidateQueries({ queryKey: ['telematicsDevice', deviceId] });
    },
    onError: (error) => {
      toast.error('Failed to update delay', { description: error.message });
    },
  });

  const handleSave = () => {
    const newDelay = parseInt(delay, 10);
    if (isNaN(newDelay) || newDelay < 0 || newDelay > 30) {
      toast.error('Invalid delay', { description: 'Must be a number between 0 and 30.' });
      return;
    }
    mutation.mutate(newDelay);
  };

  if (!device) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Noran MT20 Command Release</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="release-delay">Post-heartbeat command release delay (seconds)</Label>
          <Input 
            id="release-delay" 
            type="number" 
            min="0" 
            max="30" 
            value={delay} 
            onChange={(e) => setDelay(e.target.value)} 
            className="max-w-xs"
          />
          <p className="text-sm text-muted-foreground">
            Use 0 to release immediately after heartbeat. Use this to test command release timing.
          </p>
        </div>
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Save Delay Setting'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default TelematicsDeviceVerification;