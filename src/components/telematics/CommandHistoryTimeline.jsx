import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { commandLabel, normalizeCommandName } from "@/lib/telematics/commandVocabulary";

function fmt(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function latency(command) {
  const value = command.execution_latency_ms ?? command.delivery_latency_ms;
  return Number.isFinite(Number(value)) ? `${Number(value)}ms` : "—";
}

export default function CommandHistoryTimeline({ commands = [], vehiclesById = {}, devicesById = {}, compact = false }) {
  const [expanded, setExpanded] = useState(null);

  if (!commands.length) {
    return <div className="rounded-2xl border border-border p-5 text-center text-sm text-muted-foreground">No vehicle command history yet.</div>;
  }

  return (
    <div className="space-y-2">
      {commands.map((command) => {
        const status = command.queue_status || command.status || "unknown";
        const isExpanded = expanded === command.id;
        const vehicle = vehiclesById[command.vehicle_id];
        const device = devicesById[command.telematics_device_id];
        return (
          <div key={command.id} className="rounded-2xl border border-border bg-card/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-sm">{commandLabel(normalizeCommandName(command.command_type))}</p>
                <p className="text-xs text-muted-foreground">
                  {command.requested_by || "system"} · {command.requested_role || "—"} · {fmt(command.sent_at || command.created_at || command.created_date)}
                </p>
                {!compact && <p className="text-xs text-muted-foreground mt-1">Vehicle: {vehicle?.display_name || vehicle?.vin || command.vehicle_id || "—"} · Device: {device?.unique_id || command.device_unique_id || command.telematics_device_id || "—"}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{status}</Badge>
                <Button size="sm" variant="outline" onClick={() => setExpanded(isExpanded ? null : command.id)}>{isExpanded ? "Hide" : "Details"}</Button>
              </div>
            </div>
            {isExpanded && (
              <div className="mt-3 grid gap-2 rounded-xl border border-border bg-background/40 p-3 text-xs sm:grid-cols-2">
                <Info label="Ack time" value={fmt(command.acknowledged_at || command.device_acknowledged_at)} />
                <Info label="Executed" value={fmt(command.executed_at || command.confirmed_at)} />
                <Info label="Latency" value={latency(command)} />
                <Info label="Failure" value={command.failure_reason || "—"} />
                <div className="sm:col-span-2">
                  <p className="font-bold text-muted-foreground">Provider response</p>
                  <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-black/20 p-2 text-[10px] whitespace-pre-wrap">{JSON.stringify(command.provider_response || {}, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Info({ label, value }) {
  return <div><p className="font-bold text-muted-foreground">{label}</p><p className="break-words">{value}</p></div>;
}