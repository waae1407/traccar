import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapPin, ShieldAlert, Gauge } from 'lucide-react';

export default function SafetyTriggerConfigCard({ device, compact = false }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    geofence_enabled: false,
    geofence_location_method: 'coordinates',
    geofence_zipcode: '',
    geofence_zipcode_label: '',
    geofence_latitude: '',
    geofence_longitude: '',
    geofence_radius_meters: 300,
    geofence_mode: 'exit',
    overspeed_enabled: false,
    overspeed_limit_mph: 75,
    notes: ''
  });
  const [message, setMessage] = useState('');

  const { data: configs = [] } = useQuery({
    queryKey: ['telematics-safety-trigger-config', device?.id],
    queryFn: () => base44.entities.TelematicsSafetyTriggerConfig.filter({ device_id: device.id }),
    enabled: !!device?.id
  });

  const config = configs[0];

  useEffect(() => {
    if (!config) return;
    setForm({
      geofence_enabled: config.geofence_enabled === true,
      geofence_location_method: config.geofence_location_method || 'coordinates',
      geofence_zipcode: config.geofence_zipcode || '',
      geofence_zipcode_label: config.geofence_zipcode_label || '',
      geofence_latitude: config.geofence_latitude ?? '',
      geofence_longitude: config.geofence_longitude ?? '',
      geofence_radius_meters: config.geofence_radius_meters || 300,
      geofence_mode: config.geofence_mode || 'exit',
      overspeed_enabled: config.overspeed_enabled === true,
      overspeed_limit_mph: config.overspeed_limit_mph || 75,
      notes: config.notes || ''
    });
  }, [config?.id]);

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const activeCount = Number(form.geofence_enabled) + Number(form.overspeed_enabled);

  const save = useMutation({
    mutationFn: async () => {
      let geofenceLatitude = form.geofence_latitude;
      let geofenceLongitude = form.geofence_longitude;
      let geofenceZipcodeLabel = form.geofence_zipcode_label;

      if (form.geofence_enabled && form.geofence_location_method === 'zipcode') {
        const result = await base44.functions.invoke('geocodeZipcode', { zipcode: form.geofence_zipcode });
        geofenceLatitude = result.data.lat;
        geofenceLongitude = result.data.lon;
        geofenceZipcodeLabel = [result.data.city, result.data.state].filter(Boolean).join(', ');
      }

      return base44.functions.invoke('setTelematicsSafetyTriggers', {
        device_id: device.id,
        status: activeCount ? 'active' : 'disabled',
        ...form,
        geofence_zipcode_label: geofenceZipcodeLabel,
        geofence_latitude: geofenceLatitude === '' ? undefined : Number(geofenceLatitude),
        geofence_longitude: geofenceLongitude === '' ? undefined : Number(geofenceLongitude),
        geofence_radius_meters: Number(form.geofence_radius_meters || 300),
        overspeed_limit_mph: Number(form.overspeed_limit_mph || 75)
      });
    },
    onSuccess: () => {
      setMessage('Safety triggers saved.');
      queryClient.invalidateQueries({ queryKey: ['telematics-safety-trigger-config', device?.id] });
    },
    onError: (error) => setMessage(error?.response?.data?.error || error.message)
  });

  if (!device) return null;

  return (
    <Card className={`${compact ? 'bg-white/[0.03]' : 'glass'} border-primary/20`}>
      <CardHeader className={compact ? 'p-4 pb-2' : undefined}>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" /> Safety Triggers
          <Badge className={activeCount ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white/70'}>{activeCount ? `${activeCount} Active` : 'Off'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className={`${compact ? 'p-4 pt-2' : ''} space-y-4`}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.geofence_enabled} onChange={(e) => updateField('geofence_enabled', e.target.checked)} /> <MapPin className="h-4 w-4 text-primary" /> Geofence</label>
            <div className="grid gap-2">
              <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.geofence_location_method} onChange={(e) => updateField('geofence_location_method', e.target.value)}>
                <option value="coordinates">Use latitude / longitude</option>
                <option value="zipcode">Use ZIP code</option>
              </select>
              {form.geofence_location_method === 'zipcode' ? (
                <Input placeholder="ZIP code" value={form.geofence_zipcode} onChange={(e) => updateField('geofence_zipcode', e.target.value.replace(/\D/g, '').slice(0, 5))} />
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Latitude" value={form.geofence_latitude} onChange={(e) => updateField('geofence_latitude', e.target.value)} />
                  <Input placeholder="Longitude" value={form.geofence_longitude} onChange={(e) => updateField('geofence_longitude', e.target.value)} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Radius meters" type="number" value={form.geofence_radius_meters} onChange={(e) => updateField('geofence_radius_meters', e.target.value)} />
                <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.geofence_mode} onChange={(e) => updateField('geofence_mode', e.target.value)}>
                  <option value="exit">Alert on exit</option>
                  <option value="enter">Alert on enter</option>
                  <option value="both">Alert on both</option>
                </select>
              </div>
            </div>
            {form.geofence_location_method === 'coordinates' ? (
              <Button size="sm" variant="outline" onClick={() => {
                if (device.last_latitude !== undefined && device.last_longitude !== undefined) {
                  updateField('geofence_latitude', device.last_latitude);
                  updateField('geofence_longitude', device.last_longitude);
                }
              }}>Use current location</Button>
            ) : (
              <p className="text-xs text-muted-foreground">ZIP code will be converted into a geofence center when saved.</p>
            )}
          </div>

          <div className="rounded-2xl border border-border p-3 space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.overspeed_enabled} onChange={(e) => updateField('overspeed_enabled', e.target.checked)} /> <Gauge className="h-4 w-4 text-primary" /> Overspeed</label>
            <Input placeholder="Speed limit mph" type="number" value={form.overspeed_limit_mph} onChange={(e) => updateField('overspeed_limit_mph', e.target.value)} />
            <p className="text-xs text-muted-foreground">Creates an alert when vehicle speed exceeds this limit.</p>
          </div>
        </div>
        <Input placeholder="Internal notes" value={form.notes} onChange={(e) => updateField('notes', e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save Triggers</Button>
          {message && <p className="text-xs text-muted-foreground">{message}</p>}
        </div>
      </CardContent>
    </Card>
  );
}