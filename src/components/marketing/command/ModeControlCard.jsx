import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Pause, ShieldAlert, Check } from "lucide-react";

const MODES = [
  { key: "manual", label: "Manual", note: "You generate and publish every campaign yourself." },
  { key: "approval", label: "Approval", note: "Generated daily, then waits for your approval before publishing." },
  { key: "autonomous", label: "Autonomous", note: "Generates, validates and publishes without intervention." },
];

const STEPS = [
  { key: "review", label: "Review functionality" },
  { key: "select", label: "Select feature + angle" },
  { key: "generate", label: "Generate flyer + captions" },
  { key: "validate", label: "Quality validation" },
  { key: "instagram", label: "Instagram publish" },
  { key: "facebook", label: "Facebook publish" },
  { key: "x", label: "X publish" },
  { key: "metrics", label: "Collect metrics" },
];

export default function ModeControlCard({ state, onChanged }) {
  const [schedule, setSchedule] = useState(state.schedule);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => setSchedule(state.schedule), [state.schedule]);

  const run = async (payload, okMessage) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await base44.functions.invoke("marketingControl", payload);
      setMessage(okMessage);
      await onChanged();
      return res.data;
    } catch (error) {
      setMessage(error?.response?.data?.error || error.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-syne text-lg font-bold">Operating mode</h2>
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{state.timezone}</span>
      </div>

      <div className="grid gap-2">
        {MODES.map((mode) => {
          const active = state.mode === mode.key;
          const locked = mode.key === "autonomous" && !state.autonomous_authorized;
          return (
            <button
              key={mode.key}
              type="button"
              disabled={busy || locked}
              onClick={() => run({ action: "set_mode", mode: mode.key }, `Mode set to ${mode.label}`)}
              className={`text-left rounded-xl border p-3 transition ${
                active ? "border-primary/60 bg-primary/10" : "border-border/60 hover:border-primary/30"
              } ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">{mode.label}</span>
                {active && <Check className="w-4 h-4 text-primary" />}
                {locked && <span className="text-[10px] uppercase text-muted-foreground">not authorized</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{mode.note}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <Button
          size="sm"
          variant={state.paused ? "default" : "outline"}
          disabled={busy}
          onClick={() => run({ action: state.paused ? "resume" : "pause" }, state.paused ? "Automation resumed" : "Automation paused")}
        >
          {state.paused ? <Play className="w-4 h-4 mr-1" /> : <Pause className="w-4 h-4 mr-1" />}
          {state.paused ? "Resume automation" : "Pause automation"}
        </Button>
        {state.emergency_stopped ? (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run({ action: "clear_emergency" }, "Emergency stop cleared")}>
            Clear emergency stop
          </Button>
        ) : (
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => run({ action: "emergency_stop" }, "Emergency stop engaged")}>
            <ShieldAlert className="w-4 h-4 mr-1" /> Emergency stop
          </Button>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Daily schedule</h3>
        <div className="grid grid-cols-2 gap-2">
          {STEPS.map((step) => (
            <label key={step.key} className="text-xs text-muted-foreground">
              {step.label}
              <Input
                type="time"
                value={schedule[step.key] || ""}
                onChange={(event) => setSchedule({ ...schedule, [step.key]: event.target.value })}
                className="mt-1 h-8 text-sm"
              />
            </label>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-3 w-full"
          disabled={busy}
          onClick={() => run({ action: "save_schedule", schedule }, "Schedule saved")}
        >
          Save schedule
        </Button>
      </div>

      {message && <p className="text-xs text-muted-foreground mt-3">{message}</p>}
    </div>
  );
}