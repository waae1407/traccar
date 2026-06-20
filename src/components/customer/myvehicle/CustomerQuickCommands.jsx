import React, { useState } from "react";
import { Loader2, Lock, MapPin, Unlock, Volume2 } from "lucide-react";
import TelematicsService from "@/lib/telematics/TelematicsService";
import { getCommandReadiness } from "@/lib/telematics/commandReadiness";

const COMMANDS = [
  { key: "locate", label: "Locate Vehicle", icon: MapPin, tone: "from-sky-500 to-cyan-400" },
  { key: "unlock", label: "Unlock Vehicle", icon: Unlock, tone: "from-emerald-500 to-teal-400" },
  { key: "lock", label: "Lock Vehicle", icon: Lock, tone: "from-violet-500 to-purple-400" },
  { key: "alarm_pulse", label: "Find Vehicle", icon: Volume2, tone: "from-amber-500 to-orange-400" },
];

export default function CustomerQuickCommands({ booking, vehicle, device, onComplete }) {
  const [sending, setSending] = useState(null);

  const send = async (commandType) => {
    setSending(commandType);
    try {
      await TelematicsService.sendCommand({
        booking_id: booking.id,
        vehicle_id: vehicle?.id || booking.vehicle_id,
        command_type: commandType,
        source: "customer_my_vehicle",
      });
      await onComplete?.();
    } catch (error) {
      console.error('[CustomerQuickCommands] Command error:', error);
    } finally {
      setTimeout(() => setSending(null), 3000);
    }
  };

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
          const isSending = sending === command.key;

          return (
            <button
              key={command.key}
              disabled={!ready.supported || isSending}
              onClick={() => send(command.key)}
              className="min-h-[112px] rounded-[1.6rem] border border-white/60 bg-white p-3 text-left shadow-sm transition-all active:scale-[0.98] disabled:opacity-45"
            >
              <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${command.tone} shadow-lg`}>
                {isSending ? (
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                ) : (
                  <Icon className="h-5 w-5 text-white" />
                )}
              </div>
              <p className="text-sm font-black leading-tight text-gray-950">{command.label}</p>
              <p className="mt-1 text-[11px] font-semibold text-gray-400">{ready.supported ? "Ready now" : "Unavailable"}</p>
              {isSending && (
                <p className="mt-1 text-[10px] font-bold text-gray-400">Sending…</p>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}