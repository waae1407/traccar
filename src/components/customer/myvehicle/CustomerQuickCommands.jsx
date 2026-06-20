import React, { useEffect } from "react";
import { CheckCircle2, Loader2, Lock, MapPin, Unlock, Volume2, XCircle } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { getCommandReadiness } from "@/lib/telematics/commandReadiness";
import { useCommandProgress, PHASES } from "@/hooks/useCommandProgress";

const COMMANDS = [
  { key: "locate", label: "Locate Vehicle", icon: MapPin, tone: "from-sky-500 to-cyan-400" },
  { key: "unlock", label: "Unlock Vehicle", icon: Unlock, tone: "from-emerald-500 to-teal-400" },
  { key: "lock", label: "Lock Vehicle", icon: Lock, tone: "from-violet-500 to-purple-400" },
  { key: "alarm_pulse", label: "Find Vehicle", icon: Volume2, tone: "from-amber-500 to-orange-400" },
];

const COMMAND_LABELS = {
  lock: { success: "Locked", failed: "Not Locked" },
  unlock: { success: "Unlocked", failed: "Not Unlocked" },
  locate: { success: "Located", failed: "Not Located" },
  alarm_pulse: { success: "Alert Sent", failed: "Alert Failed" },
};

export default function CustomerQuickCommands({ booking, vehicle, device, onComplete }) {
  const progress = useCommandProgress();
  const resultText = progress.phase === PHASES.success 
    ? "Vehicle response confirmed" 
    : progress.phase === PHASES.failed 
    ? progress.errorMessage || "Command failed"
    : null;

  const send = async (commandType) => {
    progress.startOptimistic(commandType);
    try {
      const response = await TelematicsService.sendCommand({
        booking_id: booking.id,
        vehicle_id: vehicle?.id || booking.vehicle_id,
        command_type: commandType,
        source: "customer_my_vehicle",
      });
      const cmdId = response.data?.command_id || response.data?.id;
      progress.transitionToPolling(commandType, cmdId);
      await onComplete?.();
    } catch (error) {
      progress.reset();
    }
  };

  // Auto-reset after completion
  useEffect(() => {
    if (progress.phase === PHASES.success || progress.phase === PHASES.failed) {
      const timer = setTimeout(() => progress.reset(), progress.phase === PHASES.success ? 3000 : 4000);
      return () => clearTimeout(timer);
    }
  }, [progress.phase, progress.reset]);

  return (
    <section className="px-5">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">Quick Commands</p>
          <h2 className="text-lg font-black text-gray-950" style={{ fontFamily: "var(--font-syne)" }}>Remote Access</h2>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500">Secure</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {COMMANDS.map((command) => {
          const Icon = command.icon;
          const ready = getCommandReadiness({ command: command.key, role: "customer", device: device || {}, provider: {}, booking });
          const isThisCommand = progress.commandType === command.key;
          const isContacting = isThisCommand && progress.phase === PHASES.contacting;
          const isResponding = isThisCommand && progress.phase === PHASES.vehicle_responding;
          const isSuccess = isThisCommand && progress.phase === PHASES.success;
          const isFailed = isThisCommand && progress.phase === PHASES.failed;
          const labels = COMMAND_LABELS[command.key] || { success: "Done", failed: "Failed" };

          let buttonContent = <Icon className="h-5 w-5 text-white" />;
          let statusLabel = command.label;
          let statusSub = ready.supported ? "Ready now" : "Unavailable";
          let isDisabled = !ready.supported || isContacting || isResponding;

          if (isContacting || isResponding) {
            buttonContent = <Loader2 className="h-5 w-5 animate-spin text-white" />;
            statusLabel = isContacting ? "Contacting vehicle…" : "Vehicle responding…";
            statusSub = `${progress.elapsed}s elapsed`;
          } else if (isSuccess) {
            buttonContent = <CheckCircle2 className="h-5 w-5 text-white" />;
            statusLabel = labels.success;
            statusSub = "Command completed";
          } else if (isFailed) {
            buttonContent = <XCircle className="h-5 w-5 text-white" />;
            statusLabel = labels.failed;
            statusSub = "Command failed";
          }

          return (
            <button
              key={command.key}
              disabled={isDisabled}
              onClick={() => send(command.key)}
              className="min-h-[112px] rounded-[1.6rem] border border-white/60 bg-white p-3 text-left shadow-sm transition-all active:scale-[0.98] disabled:opacity-45"
            >
              <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${command.tone} shadow-lg`}>
                {buttonContent}
              </div>
              <p className="text-sm font-black leading-tight text-gray-950">{statusLabel}</p>
              <p className="mt-1 text-[11px] font-semibold text-gray-400">{statusSub}</p>
            </button>
          );
        })}
      </div>

      {resultText && (
        <div className={`mt-3 rounded-2xl border px-4 py-3 text-xs font-bold ${progress.phase === PHASES.failed ? "border-red-100 bg-red-50 text-red-600" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
          {resultText}
        </div>
      )}
    </section>
  );
}