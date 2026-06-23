import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldAlert, AlertTriangle, AlertCircle, Clock, MapPin, Car, Info, Key, FileText, CheckCircle, ExternalLink, Hash } from 'lucide-react';
import { format, isValid } from 'date-fns';

const safeFormat = (dateStr, fmt) => {
  if (!dateStr) return 'Unknown';
  const d = new Date(dateStr);
  return isValid(d) ? format(d, fmt) : 'Unknown';
};
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

export default function Alert360DetailDrawer({ open, onOpenChange, alert, onIncidentClick }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';
  const isHost = user?.role === 'host' || (!isAdmin && user?.role !== 'user'); // Approximation

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteText, setNoteText] = useState('');

  if (!alert) return null;

  const handleAction = async (action, additionalArgs = {}) => {
    setIsSubmitting(true);
    try {
      await base44.functions.invoke('updateAlert360EventStatus', {
        event_id: alert.id,
        action,
        ...additionalArgs
      });
      toast.success('Alert updated successfully');
      queryClient.invalidateQueries(['admin-alert360-dashboard']);
      queryClient.invalidateQueries(['host-alert360-dashboard']);
      queryClient.invalidateQueries(['vehicle-360', alert.vehicle_id]);
      if (action === 'resolve' || action === 'dismiss_false_positive') {
        onOpenChange(false);
      }
    } catch (e) {
      toast.error('Failed to update alert');
    }
    setIsSubmitting(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl overflow-y-auto bg-background text-foreground border-border">
        <SheetHeader className="mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {alert.severity === 'critical' ? (
                <div className="bg-red-500/10 p-2 rounded-lg">
                  <ShieldAlert className="h-6 w-6 text-red-500" />
                </div>
              ) : (
                <div className="bg-amber-500/10 p-2 rounded-lg">
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                </div>
              )}
              <div>
                <SheetTitle className="text-xl font-bold">{alert.alert_title || alert.alert_type}</SheetTitle>
                <SheetDescription className="text-muted-foreground">{alert.category} • Occurrences: {alert.occurrence_count || 1}</SheetDescription>
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="vehicle">Vehicle</TabsTrigger>
            {(isAdmin || isHost) && <TabsTrigger value="raw">Raw Data</TabsTrigger>}
            <TabsTrigger value="notes">Resolution</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-secondary/30 p-4 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Status</p>
                <Badge variant={alert.is_active ? 'destructive' : 'secondary'} className="uppercase">
                  {alert.status?.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="bg-secondary/30 p-4 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Escalation Level</p>
                <p className="font-semibold">{alert.escalation_level || 0}</p>
              </div>
              <div className="bg-secondary/30 p-4 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase font-bold mb-1">First Seen</p>
                <p className="text-sm">{safeFormat(alert.first_seen_at, 'MMM d, yyyy h:mm:ss a')}</p>
              </div>
              <div className="bg-secondary/30 p-4 rounded-xl">
                <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Last Seen</p>
                <p className="text-sm">{safeFormat(alert.last_seen_at, 'MMM d, yyyy h:mm:ss a')}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2">Message</h3>
              <p className="bg-secondary/30 p-4 rounded-xl text-sm border border-border">
                {alert.alert_message || 'No specific message provided.'}
              </p>
            </div>

            {alert.linked_incident_id && (
              <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs text-red-500 uppercase font-bold mb-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Linked Incident
                  </p>
                  <p className="text-sm font-semibold">{alert.linked_incident_id}</p>
                </div>
                <button 
                  onClick={() => {
                    onOpenChange(false);
                    if (onIncidentClick) onIncidentClick(alert.linked_incident_id);
                  }}
                  className="text-red-500 text-sm font-bold flex items-center gap-1 hover:underline"
                >
                  View Incident <ExternalLink className="h-4 w-4" />
                </button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="vehicle" className="space-y-6">
            <div className="bg-secondary/30 p-4 rounded-xl space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Vehicle Snapshot</h3>
              </div>
              <div className="grid grid-cols-2 gap-y-4 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-bold">Vehicle</p>
                  <p className="font-medium">{alert.vehicle_display_name || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-bold">VIN</p>
                  <p className="font-medium">{alert.vin || 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-bold">Odometer</p>
                  <p className="font-medium">{alert.odometer ? `${alert.odometer} mi` : 'Unknown'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-bold">Battery Volt</p>
                  <p className="font-medium">{alert.battery_voltage ? `${alert.battery_voltage}V` : 'Unknown'}</p>
                </div>
              </div>
            </div>

            {(isAdmin || isHost) && (
              <div className="bg-secondary/30 p-4 rounded-xl space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Key className="h-5 w-5 text-primary" /> Device & Rental</h3>
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase font-bold">Host</p>
                    <p className="font-medium">{alert.host_name || alert.host_id || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase font-bold">Customer</p>
                    <p className="font-medium">{alert.customer_name || alert.customer_id || 'None'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs uppercase font-bold">Device ID</p>
                    <p className="font-mono text-xs break-all">{alert.device_unique_id}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs uppercase font-bold">Booking ID</p>
                    <p className="font-mono text-xs break-all">{alert.booking_id || 'None'}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-secondary/30 p-4 rounded-xl">
              <h3 className="font-semibold flex items-center gap-2 mb-3"><MapPin className="h-5 w-5 text-primary" /> Location</h3>
              {alert.lat && alert.lon ? (
                <div>
                  <p className="text-sm mb-2">{alert.address_label || `${alert.lat}, ${alert.lon}`}</p>
                  <a 
                    href={`https://maps.google.com/?q=${alert.lat},${alert.lon}`} 
                    target="_blank" rel="noreferrer"
                    className="text-primary text-sm font-semibold flex items-center gap-1 hover:underline"
                  >
                    Open in Maps <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Location not available in this alert.</p>
              )}
            </div>
          </TabsContent>

          {(isAdmin || isHost) && (
            <TabsContent value="raw" className="space-y-4">
              <div className="bg-black text-green-400 p-4 rounded-xl border border-border font-mono text-xs overflow-auto max-h-64">
                <p className="text-white mb-2 font-bold">// Raw Packet Hex</p>
                <p className="break-all">{alert.raw_packet_hex || 'Not available'}</p>
              </div>

              {alert.parsed_payload_json && (
                <div className="bg-black text-blue-400 p-4 rounded-xl border border-border font-mono text-xs overflow-auto max-h-64">
                  <p className="text-white mb-2 font-bold">// Parsed Payload</p>
                  <pre>{JSON.stringify(alert.parsed_payload_json, null, 2)}</pre>
                </div>
              )}

              {alert.command_id && (
                <div className="bg-secondary/30 p-4 rounded-xl text-sm">
                  <p className="font-bold mb-2 flex items-center gap-2"><Hash className="h-4 w-4" /> Related Command</p>
                  <p><span className="text-muted-foreground">ID:</span> {alert.command_id}</p>
                  <p><span className="text-muted-foreground">Type:</span> {alert.command_type}</p>
                  <p><span className="text-muted-foreground">ACK Hex:</span> <span className="font-mono text-xs">{alert.raw_ack_hex || 'None'}</span></p>
                  <p><span className="text-muted-foreground">ACK Status:</span> {alert.ack_status || 'Unknown'}</p>
                </div>
              )}
            </TabsContent>
          )}

          <TabsContent value="notes" className="space-y-6">
            <div className="bg-secondary/30 p-4 rounded-xl">
              <h3 className="font-semibold mb-2">Internal Notes & Audit</h3>
              <div className="bg-background border border-border p-3 rounded-lg text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto mb-4">
                {alert.internal_notes || 'No internal notes.'}
              </div>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Add an internal note..." 
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                />
                <button 
                  onClick={() => {
                    handleAction('add_note', { note: noteText });
                    setNoteText('');
                  }}
                  disabled={!noteText || isSubmitting}
                  className="bg-secondary text-foreground px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">Resolution Actions</h3>
              
              {alert.status === 'new' && (
                <button 
                  onClick={() => handleAction('acknowledge')}
                  disabled={isSubmitting}
                  className="w-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 p-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-yellow-500/30 transition-colors"
                >
                  <Clock className="h-4 w-4" /> Acknowledge Alert
                </button>
              )}

              {alert.is_active && (
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => {
                      const note = prompt('Resolution notes (required):');
                      if (note) handleAction('resolve', { note });
                    }}
                    disabled={isSubmitting}
                    className="w-full bg-green-500/20 text-green-500 border border-green-500/30 p-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-green-500/30 transition-colors"
                  >
                    <CheckCircle className="h-4 w-4" /> Resolve
                  </button>
                  <button 
                    onClick={() => {
                      const reason = prompt('Reason for false positive:');
                      if (reason) handleAction('dismiss_false_positive', { reason });
                    }}
                    disabled={isSubmitting}
                    className="w-full bg-muted text-muted-foreground border border-border p-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-secondary transition-colors"
                  >
                    <Info className="h-4 w-4" /> False Positive
                  </button>
                </div>
              )}
              
              {!alert.is_active && (
                <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl text-green-500 flex items-center gap-3">
                  <CheckCircle className="h-6 w-6" />
                  <div>
                    <p className="font-bold">Alert Closed</p>
                    <p className="text-sm text-green-500/80">Resolved by {alert.resolved_by || 'System'}</p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}