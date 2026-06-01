import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, ShieldCheck } from "lucide-react";

const PROMPTS = {
  vehicle_movement_detected: {
    title: "Vehicle Movement Detected",
    body: "Your parked vehicle appears to be moving while ignition is off.\n\nIs this expected?",
    positive: "Yes, this is expected",
    negative: "No, investigate",
    positiveAction: "movement_expected",
    negativeAction: "movement_investigate",
  },
  possible_accident: {
    title: "Possible Accident Detected",
    body: "Are you OK?",
    positive: "I’m OK",
    negative: "Need Help",
    positiveAction: "accident_ok",
    negativeAction: "accident_need_help",
  },
};

export default function CustomerSafetyCheck({ booking }) {
  const qc = useQueryClient();
  const queryKey = ["customer-safety-events", booking?.id];
  const { data } = useQuery({
    queryKey,
    queryFn: async () => (await base44.functions.invoke("listTelematicsSafetyEvents", { booking_id: booking.id, status: "all", limit: 10 })).data,
    enabled: !!booking?.id,
    refetchInterval: 15000,
  });
  const actionMutation = useMutation({
    mutationFn: (payload) => base44.functions.invoke("handleTelematicsSafetyEventAction", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  const events = (data?.events || []).filter(event => ["open", "escalated"].includes(event.status));
  if (events.length === 0) return null;

  return (
    <div className="mx-4 mb-3 space-y-3">
      {events.map(event => {
        const prompt = PROMPTS[event.event_type];
        if (!prompt) return null;
        const isCritical = event.severity === "critical";
        return (
          <div key={event.id} className="rounded-2xl overflow-hidden border" style={{ background: isCritical ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)", borderColor: isCritical ? "rgba(239,68,68,0.28)" : "rgba(245,158,11,0.28)" }}>
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: isCritical ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)" }}>
                  {isCritical ? <AlertTriangle className="h-5 w-5 text-red-300" /> : <ShieldCheck className="h-5 w-5 text-amber-300" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{prompt.title}</p>
                  <p className="text-[11px] text-white/45">Safety Check</p>
                </div>
              </div>
              <p className="text-xs text-white/70 whitespace-pre-line leading-relaxed">{prompt.body}</p>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ event_id: event.id, action: prompt.positiveAction })} className="rounded-xl py-2.5 text-xs font-bold text-white bg-emerald-500/80 disabled:opacity-60">{prompt.positive}</button>
                <button disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ event_id: event.id, action: prompt.negativeAction })} className="rounded-xl py-2.5 text-xs font-bold text-white bg-red-500/80 disabled:opacity-60">{prompt.negative}</button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}