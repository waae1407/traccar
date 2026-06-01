import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, MapPin, Navigation, Phone, ShieldAlert, Siren } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";

const EVENT_LABELS = {
  vehicle_movement_detected: "Vehicle Movement Detected",
  possible_accident: "Possible Accident Detected",
};

const severityClass = {
  info: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  warning: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
};

function locationUrl(event) {
  if (event.latitude == null || event.longitude == null) return "";
  return `https://www.google.com/maps?q=${event.latitude},${event.longitude}`;
}

export default function SafetyEventsPanel({ role = "admin", title = "Safety Events", vehicleId }) {
  const qc = useQueryClient();
  const queryKey = ["telematics-safety-events", role, vehicleId || "all"];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => (await base44.functions.invoke("listTelematicsSafetyEvents", { status: "all", vehicle_id: vehicleId || undefined, limit: role === "admin" ? 100 : 50 })).data,
    refetchInterval: 15000,
  });
  const events = data?.events || [];

  const actionMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("handleTelematicsSafetyEventAction", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const alarmMutation = useMutation({
    mutationFn: ({ event, action }) => action === "start" ? TelematicsService.startAlarm({ vehicle_id: event.vehicle_id }) : TelematicsService.cancelAlarm({ vehicle_id: event.vehicle_id, reason: "safety_event_manual_cancel" }),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-black flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" />{title}</h2>
        <Badge variant="outline">{events.filter(e => ["open", "escalated"].includes(e.status)).length} active</Badge>
      </div>
      <Card className="glass">
        <CardContent className="p-4 space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground py-6 text-center">Loading safety events…</p>}
          {!isLoading && events.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6"><CheckCircle2 className="h-6 w-6 mx-auto mb-2" />No tow or accident safety events.</p>
          )}
          {events.map(event => {
            const mapUrl = locationUrl(event);
            return (
              <div key={event.id} className="rounded-2xl border border-border bg-card/60 p-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black">{EVENT_LABELS[event.event_type] || event.event_type}</p>
                      <Badge variant="outline" className={severityClass[event.severity] || ""}>{event.severity}</Badge>
                      <Badge variant="outline">{event.confidence} confidence</Badge>
                      <Badge variant="outline">{event.status}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{event.vehicle_label || event.vehicle_id} · Host: {event.host_label || "—"}{event.customer_label ? ` · Customer: ${event.customer_label}` : ""}</p>
                    <p className="text-xs text-muted-foreground">Last telemetry: speed {event.speed ?? "—"}, ACC {event.acc_status || "unknown"}, shock {event.shock_detected ? "yes" : "no"}, {event.started_at ? new Date(event.started_at).toLocaleString() : "—"}</p>
                    {event.last_known_location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{event.last_known_location}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mapUrl && <Button size="sm" variant="outline" onClick={() => window.open(mapUrl, "_blank")}><MapPin className="h-4 w-4" />View Location</Button>}
                    {mapUrl && <Button size="sm" variant="outline" onClick={() => window.open(mapUrl, "_blank")}><Navigation className="h-4 w-4" />Track Live</Button>}
                    {event.customer_phone && <Button size="sm" variant="outline" asChild><a href={`tel:${event.customer_phone}`}><Phone className="h-4 w-4" />Call Customer</a></Button>}
                    <Button size="sm" variant="outline" onClick={() => alarmMutation.mutate({ event, action: "start" })}><Siren className="h-4 w-4" />Trigger Alarm</Button>
                    <Button size="sm" variant="outline" onClick={() => alarmMutation.mutate({ event, action: "cancel" })}>Cancel Alarm</Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
                  <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ event_id: event.id, action: "mark_false_alarm" })}>Mark False Alarm</Button>
                  <Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ event_id: event.id, action: "create_incident" })}><AlertTriangle className="h-4 w-4" />Create Incident</Button>
                  <Button size="sm" onClick={() => actionMutation.mutate({ event_id: event.id, action: "resolve_event" })}>Resolve Event</Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </section>
  );
}