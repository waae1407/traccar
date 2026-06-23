import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldAlert, AlertTriangle, AlertCircle, Clock, MapPin, Car, Info, Key, FileText, CheckCircle, ExternalLink, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import Alert360DetailDrawer from './Alert360DetailDrawer';

export default function Alert360IncidentDrawer({ open, onOpenChange, incident }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);

  const { data: relatedEvents = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['incident-related-events', incident?.id],
    queryFn: () => base44.entities.TelematicsSafetyEvent.filter({ linked_incident_id: incident.id }, '-first_seen_at', 50),
    enabled: !!incident?.id,
  });

  if (!incident) return null;

  const handleAction = async (action, additionalArgs = {}) => {
    setIsSubmitting(true);
    try {
      await base44.functions.invoke('updateAlert360IncidentStatus', {
        incident_id: incident.id,
        action,
        ...additionalArgs
      });
      toast.success('Incident updated successfully');
      queryClient.invalidateQueries(['admin-alert360-dashboard']);
      queryClient.invalidateQueries(['host-alert360-dashboard']);
      if (action === 'resolve' || action === 'dismiss_false_positive') {
        onOpenChange(false);
      }
    } catch (e) {
      toast.error('Failed to update incident');
    }
    setIsSubmitting(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto bg-background text-foreground border-border">
          <SheetHeader className="mb-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                  <AlertCircle className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <SheetTitle className="text-xl font-bold">{incident.incident_title}</SheetTitle>
                  <SheetDescription className="text-muted-foreground">{incident.incident_type} • ID: {incident.id.slice(-6)}</SheetDescription>
                </div>
              </div>
            </div>
          </SheetHeader>

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="w-full grid grid-cols-3 mb-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="events">Related Events</TabsTrigger>
              <TabsTrigger value="resolution">Resolution</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="bg-secondary/30 p-4 rounded-xl text-sm border border-border">
                {incident.incident_summary || 'No summary available.'}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary/30 p-4 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Status</p>
                  <Badge variant={incident.status === 'open' || incident.status === 'investigating' ? 'destructive' : 'secondary'} className="uppercase">
                    {incident.status?.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="bg-secondary/30 p-4 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Severity</p>
                  <p className="font-semibold text-red-500 capitalize">{incident.severity}</p>
                </div>
                <div className="bg-secondary/30 p-4 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Created</p>
                  <p className="text-sm">{incident.first_seen_at ? format(new Date(incident.first_seen_at), 'MMM d, h:mm a') : 'Unknown'}</p>
                </div>
                <div className="bg-secondary/30 p-4 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase font-bold mb-1">Total Events</p>
                  <p className="text-sm font-bold">{incident.related_event_ids?.length || 0} alerts</p>
                </div>
              </div>

              <div className="bg-secondary/30 p-4 rounded-xl space-y-4">
                <h3 className="font-semibold flex items-center gap-2"><Car className="h-5 w-5 text-primary" /> Affected Vehicle & Accounts</h3>
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs uppercase font-bold">Vehicle</p>
                    <p className="font-medium">{incident.vin || incident.vehicle_id || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase font-bold">Device</p>
                    <p className="font-mono text-xs">{incident.device_unique_id || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase font-bold">Host</p>
                    <p className="font-medium">{incident.host_name || incident.host_id || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs uppercase font-bold">Customer</p>
                    <p className="font-medium">{incident.customer_name || incident.customer_id || 'None'}</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="events" className="space-y-4">
              <h3 className="font-semibold mb-2">Event Timeline</h3>
              {eventsLoading ? (
                <p className="text-sm text-muted-foreground">Loading events...</p>
              ) : relatedEvents.length > 0 ? (
                <div className="space-y-3 relative border-l-2 border-border ml-2 pl-4 pb-4">
                  {relatedEvents.map(ev => (
                    <div 
                      key={ev.id} 
                      className="relative bg-secondary/30 p-3 rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors border border-border"
                      onClick={() => setSelectedEvent(ev)}
                    >
                      <div className={`absolute -left-[23px] top-4 h-3 w-3 rounded-full border-2 border-background ${ev.is_active ? 'bg-red-400' : 'bg-green-400'}`}></div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm text-foreground">{ev.alert_title}</p>
                          <p className="text-xs text-muted-foreground mt-1">{ev.first_seen_at ? format(new Date(ev.first_seen_at), 'MMM d, h:mm:ss a') : ''}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] uppercase">{ev.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No events attached to this incident.</p>
              )}
            </TabsContent>

            <TabsContent value="resolution" className="space-y-6">
              <div className="bg-secondary/30 p-4 rounded-xl">
                <h3 className="font-semibold mb-2">Internal Notes & Audit</h3>
                <div className="bg-background border border-border p-3 rounded-lg text-sm font-mono whitespace-pre-wrap max-h-64 overflow-y-auto mb-4">
                  {incident.internal_notes || 'No internal notes.'}
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
                
                {incident.status === 'open' && (
                  <button 
                    onClick={() => handleAction('investigating')}
                    disabled={isSubmitting}
                    className="w-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 p-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-yellow-500/30 transition-colors"
                  >
                    <Clock className="h-4 w-4" /> Mark Investigating
                  </button>
                )}

                {(incident.status === 'open' || incident.status === 'investigating') && (
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => {
                        const note = prompt('Resolution notes (required):');
                        if (note) handleAction('resolve', { note });
                      }}
                      disabled={isSubmitting}
                      className="w-full bg-green-500/20 text-green-500 border border-green-500/30 p-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-green-500/30 transition-colors"
                    >
                      <CheckCircle className="h-4 w-4" /> Resolve Incident
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
                
                {(incident.status === 'resolved' || incident.status === 'dismissed_false_positive') && (
                  <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl text-green-500 flex items-center gap-3">
                    <CheckCircle className="h-6 w-6" />
                    <div>
                      <p className="font-bold">Incident Closed</p>
                      <p className="text-sm text-green-500/80">All associated events have been closed automatically.</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <Alert360DetailDrawer 
        open={!!selectedEvent} 
        onOpenChange={(v) => !v && setSelectedEvent(null)}
        alert={selectedEvent}
      />
    </>
  );
}