import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Loader2, OctagonX } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import TelematicsService from "@/lib/telematics/TelematicsService";

export default function TelematicsAlarmControls({ vehicleId, role = "admin", onResult }) {
  const [loading, setLoading] = useState(null);
  const queryClient = useQueryClient();
  const enabled = !!vehicleId && ["admin", "host"].includes(role);
  const { data: sessions = [] } = useQuery({
    queryKey: ["active-alarm", vehicleId],
    queryFn: () => base44.entities.TelematicsAlarmSession.filter({ vehicle_id: vehicleId, status: "active" }),
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
  const active = sessions[0];
  if (!enabled) return null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["active-alarm", vehicleId] });
  const startAlarm = async () => {
    setLoading("start");
    const res = await TelematicsService.startAlarm({ vehicle_id: vehicleId });
    onResult?.(res.data);
    refresh();
    setLoading(null);
  };
  const cancelAlarm = async () => {
    setLoading("cancel");
    const res = await TelematicsService.cancelAlarm({ vehicle_id: vehicleId, alarm_session_id: active?.id, reason: "manual_cancel" });
    onResult?.(res.data);
    refresh();
    setLoading(null);
  };

  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="outline" className={active ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-border text-muted-foreground"}>
          {active ? `Alarm active · ${active.pulses_sent || 0}/${active.max_pulses || 9}` : "Alarm inactive"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={!!loading || !!active} onClick={startAlarm} className="border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20">
          {loading === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlarmClock className="h-4 w-4" />} Trigger Alarm
        </Button>
        <Button type="button" variant="outline" disabled={!!loading || !active} onClick={cancelAlarm} className="border-slate-500/30 text-slate-300 hover:bg-slate-500/10">
          {loading === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <OctagonX className="h-4 w-4" />} Cancel Alarm
        </Button>
      </div>
    </div>
  );
}