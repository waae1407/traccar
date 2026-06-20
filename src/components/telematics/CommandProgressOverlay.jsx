import React from "react";
import { CheckCircle2, Loader2, MapPin, Radio, Send, Wifi, XCircle } from "lucide-react";
import { PHASES } from "@/hooks/useCommandProgress";

const SUCCESS_LABELS = {
  lock: "Locked",
  unlock: "Unlocked",
  locate: "Located",
  horn: "Horn On",
  lights: "Lights On",
  horn_lights: "Horn & Lights On",
  alarm_pulse: "Vehicle Located",
  disable_starter: "Starter Disabled",
  restore_starter: "Starter Restored",
  status: "Status Received",
};

const WAITING_TIPS = {
  lock: ["Your vehicle is confirming the lock signal…", "Security system is engaging…", "Verifying all doors are secured…"],
  unlock: ["Your vehicle is verifying your identity…", "Unlocking and disarming security…", "Confirming vehicle is ready for access…"],
};

const PHASE_CONFIG = {
  [PHASES.connecting]: {
    icon: Radio,
    label: "Contacting Vehicle",
    sub: "Hang tight — waking up your vehicle's connection.",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/25",
    spin: false,
    pulse: true,
  },
  [PHASES.sending]: {
    icon: Send,
    label: "Command sent",
    sub: "Your vehicle is processing your request now.",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/25",
    spin: false,
    pulse: true,
  },
  [PHASES.waiting]: {
    icon: Wifi,
    label: "Confirming…",
    sub: "Verifying your vehicle's status — this takes about 10–15 seconds.",
    color: "text-primary",
    bg: "bg-primary/10 border-primary/25",
    spin: false,
    pulse: true,
  },
  opening_directions: {
    icon: MapPin,
    label: "Opening directions…",
    sub: "Get ready — maps will open with your vehicle location.",
    color: "text-purple-400",
    bg: "bg-purple-500/10 border-purple-500/25",
    spin: false,
    pulse: true,
  },
  [PHASES.success]: {
    icon: CheckCircle2,
    label: null,
    sub: null,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    spin: false,
    pulse: false,
  },
  [PHASES.failed]: {
    icon: XCircle,
    label: "Try again",
    sub: null,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    spin: false,
    pulse: false,
  },
};

const PHASE_ORDER = [PHASES.connecting, PHASES.sending, PHASES.waiting, "opening_directions", PHASES.success];

function ElapsedBadge({ seconds, phase }) {
  if (phase === PHASES.success || phase === PHASES.idle || phase === PHASES.failed) return null;
  return (
    <span className="ml-2 tabular-nums text-[10px] text-muted-foreground">
      {seconds}s
    </span>
  );
}

export default function CommandProgressOverlay({ phase, elapsed, phaseElapsed, commandType, errorMessage }) {
  if (!phase || phase === PHASES.idle) return null;

  const cfg = PHASE_CONFIG[phase];
  if (!cfg) return null;

  const Icon = cfg.icon;
  const friendlyCommand = (commandType || "").replaceAll("_", " ");
  const successLabel = phase === PHASES.success ? (SUCCESS_LABELS[commandType] || "Sent") : null;
  
  // Rotate helpful tips during longer lock/unlock waits (changes every 5s)
  const tipIndex = phase === PHASES.waiting && commandType && WAITING_TIPS[commandType]
    ? Math.min(Math.floor(phaseElapsed / 5), WAITING_TIPS[commandType].length - 1)
    : 0;
  const rotatingTip = phase === PHASES.waiting && WAITING_TIPS[commandType]?.[tipIndex];
  const displaySub = rotatingTip || cfg.sub;

  // Determine step index for progress dots
  const stepIndex = PHASE_ORDER.indexOf(phase);

  return (
    <div className={`rounded-2xl border p-3 text-sm lg:col-span-2 ${cfg.bg} transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        {cfg.pulse ? (
          <div className="relative flex items-center justify-center">
            <span className={`absolute inline-flex h-6 w-6 animate-ping rounded-full opacity-30 ${cfg.color} bg-current`} />
            <Icon className={`relative h-4 w-4 ${cfg.color}`} />
          </div>
        ) : (
          <Icon className={`h-4 w-4 ${cfg.color}`} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1 flex-wrap">
            <span className={`font-black capitalize ${cfg.color}`}>{friendlyCommand}</span>
            <span className="text-muted-foreground">·</span>
            <span className={`font-medium ${phase === PHASES.success ? "text-emerald-400 font-bold" : "text-foreground"}`}>
              {successLabel || cfg.label}
            </span>
            <ElapsedBadge seconds={elapsed} phase={phase} />
          </div>
          {(displaySub || errorMessage) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {errorMessage || displaySub}
            </p>
          )}
        </div>
      </div>

      {/* Progress steps (only for non-terminal phases) */}
      {phase !== PHASES.failed && (
        <div className="mt-3 flex items-center gap-1">
          {PHASE_ORDER.map((p, i) => {
            const isActive = i === stepIndex;
            const isDone = i < stepIndex || phase === PHASES.success;
            return (
              <React.Fragment key={p}>
                <div className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-black transition-all duration-300 ${
                  isDone
                    ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-400"
                    : isActive
                    ? `border-current ${cfg.color} bg-current/10`
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}>
                  {isDone ? "✓" : i + 1}
                </div>
                {i < PHASE_ORDER.length - 1 && (
                  <div className={`h-px flex-1 transition-all duration-500 ${isDone ? "bg-emerald-500/40" : "bg-border"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}


    </div>
  );
}