import React from "react";
import { CheckCircle2, Loader2, MapPin, Radio, Send, Shield, Unlock, Wifi, XCircle } from "lucide-react";
import { PHASES } from "@/hooks/useCommandProgress";
import { motion, AnimatePresence } from "framer-motion";

const SUCCESS_LABELS = {
  lock: "Vehicle Secured",
  unlock: "Vehicle Unlocked",
  locate: "Vehicle Located",
  horn: "Horn Activated",
  lights: "Lights Activated",
  horn_lights: "Horn & Lights Activated",
  alarm_pulse: "Alert Sent",
  disable_starter: "Starter Disabled",
  restore_starter: "Starter Restored",
  status: "Status Received",
};

const WAITING_TIPS = {
  lock: [
    "Establishing secure connection with your vehicle…",
    "Engaging security protocol…",
    "Verifying all access points are secured…",
  ],
  unlock: [
    "Authenticating your access request…",
    "Disarming security system…",
    "Preparing vehicle for access…",
  ],
};

const PHASE_CONFIG = {
  [PHASES.connecting]: {
    icon: Radio,
    label: "Establishing Connection",
    sub: "Waking up your vehicle's secure communication channel.",
    color: "from-amber-400 to-orange-500",
    textColor: "text-amber-400",
    bg: "bg-gradient-to-br from-amber-500/10 to-orange-500/5",
    border: "border-amber-500/30",
    pulse: true,
  },
  [PHASES.sending]: {
    icon: Send,
    label: "Command Sent",
    sub: "Your vehicle is processing your request.",
    color: "from-blue-400 to-cyan-500",
    textColor: "text-blue-400",
    bg: "bg-gradient-to-br from-blue-500/10 to-cyan-500/5",
    border: "border-blue-500/30",
    pulse: true,
  },
  [PHASES.waiting]: {
    icon: Shield,
    label: "Confirming",
    sub: "Verifying your vehicle's status.",
    color: "from-pink-500 to-rose-500",
    textColor: "text-pink-400",
    bg: "bg-gradient-to-br from-pink-500/10 to-rose-500/5",
    border: "border-pink-500/30",
    pulse: true,
  },
  opening_directions: {
    icon: MapPin,
    label: "Opening Directions",
    sub: "Launching navigation to your vehicle.",
    color: "from-purple-400 to-pink-500",
    textColor: "text-purple-400",
    bg: "bg-gradient-to-br from-purple-500/10 to-pink-500/5",
    border: "border-purple-500/30",
    pulse: true,
  },
  [PHASES.success]: {
    icon: CheckCircle2,
    label: null,
    sub: null,
    color: "from-emerald-400 to-green-500",
    textColor: "text-emerald-400",
    bg: "bg-gradient-to-br from-emerald-500/10 to-green-500/5",
    border: "border-emerald-500/40",
    pulse: false,
  },
  [PHASES.failed]: {
    icon: XCircle,
    label: "Connection Lost",
    sub: null,
    color: "from-red-400 to-rose-500",
    textColor: "text-red-400",
    bg: "bg-gradient-to-br from-red-500/10 to-rose-500/5",
    border: "border-red-500/30",
    pulse: false,
  },
};

const PHASE_ORDER = [PHASES.connecting, PHASES.sending, PHASES.waiting, "opening_directions", PHASES.success];

function LuxuryIcon({ Icon, color, pulse }) {
  return (
    <div className="relative flex items-center justify-center">
      {pulse && (
        <>
          <div className={`absolute inline-flex h-10 w-10 animate-ping rounded-full bg-gradient-to-r ${color} opacity-20`} />
          <div className={`absolute inline-flex h-7 w-7 animate-pulse rounded-full bg-gradient-to-r ${color} opacity-30`} />
        </>
      )}
      <div className={`relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br ${color} shadow-lg`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
    </div>
  );
}

function ProgressBar({ phase, phaseElapsed, commandType }) {
  const stepIndex = PHASE_ORDER.indexOf(phase);
  const isWaiting = phase === PHASES.waiting;
  const progress = isWaiting ? Math.min((phaseElapsed / 15) * 100, 100) : 0;

  return (
    <div className="mt-4 flex items-center gap-2">
      {PHASE_ORDER.map((p, i) => {
        const isActive = i === stepIndex;
        const isDone = i < stepIndex || phase === PHASES.success;
        return (
          <React.Fragment key={p}>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className={`relative flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold transition-all duration-500 ${
                isDone
                  ? "border-emerald-500/50 bg-gradient-to-br from-emerald-500/20 to-green-500/10 text-emerald-400 shadow-lg"
                  : isActive
                  ? `border-current bg-gradient-to-br ${PHASE_CONFIG[phase]?.color || "from-pink-500 to-rose-500"} text-white shadow-lg`
                  : "border-border bg-muted/20 text-muted-foreground"
              }`}
            >
              {isDone ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
            </motion.div>
            {i < PHASE_ORDER.length - 1 && (
              <div className="relative h-0.5 flex-1 overflow-hidden rounded-full bg-border">
                {isDone && (
                  <motion.div
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 0.5, delay: i * 0.1 }}
                    className="h-full bg-gradient-to-r from-emerald-500/60 to-green-500/40"
                  />
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export default function CommandProgressOverlay({ phase, elapsed, phaseElapsed, commandType, errorMessage }) {
  if (!phase || phase === PHASES.idle) return null;

  const cfg = PHASE_CONFIG[phase];
  if (!cfg) return null;

  const Icon = cfg.icon;
  const friendlyCommand = (commandType || "").replaceAll("_", " ");
  const successLabel = phase === PHASES.success ? (SUCCESS_LABELS[commandType] || "Complete") : null;
  
  const tipIndex = phase === PHASES.waiting && commandType && WAITING_TIPS[commandType]
    ? Math.min(Math.floor(phaseElapsed / 5), WAITING_TIPS[commandType].length - 1)
    : 0;
  const rotatingTip = phase === PHASES.waiting && WAITING_TIPS[commandType]?.[tipIndex];
  const displaySub = rotatingTip || cfg.sub;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`relative overflow-hidden rounded-3xl border p-5 lg:col-span-2 ${cfg.bg} ${cfg.border} backdrop-blur-xl shadow-2xl transition-all duration-500`}
    >
      {/* Ambient glow effect */}
      <div className={`pointer-events-none absolute -top-20 -right-20 h-40 w-40 rounded-full bg-gradient-to-br ${cfg.color} opacity-20 blur-3xl`} />
      
      {/* Content */}
      <div className="relative flex items-start gap-4">
        <LuxuryIcon Icon={Icon} color={cfg.color} pulse={cfg.pulse} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <AnimatePresence mode="wait">
              {phase === PHASES.success ? (
                <motion.span
                  key="success"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="text-lg font-bold text-emerald-400"
                >
                  {successLabel}
                </motion.span>
              ) : (
                <>
                  <motion.span
                    key="command"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`text-sm font-semibold capitalize ${cfg.textColor}`}
                  >
                    {friendlyCommand}
                  </motion.span>
                  <span className="text-muted-foreground/60">·</span>
                  <motion.span
                    key="label"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-base font-bold text-foreground"
                  >
                    {cfg.label}
                  </motion.span>
                </>
              )}
            </AnimatePresence>
            
            {phase !== PHASES.success && phase !== PHASES.failed && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground backdrop-blur-sm"
              >
                {elapsed}s
              </motion.span>
            )}
          </div>
          
          <AnimatePresence mode="wait">
            {(displaySub || errorMessage) && (
              <motion.p
                key={displaySub || errorMessage || "error"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="mt-2 text-sm text-muted-foreground/90"
              >
                {errorMessage || displaySub}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Progress Bar */}
      {phase !== PHASES.failed && phase !== PHASES.success && (
        <ProgressBar phase={phase} phaseElapsed={phaseElapsed} commandType={commandType} />
      )}
    </motion.div>
  );
}