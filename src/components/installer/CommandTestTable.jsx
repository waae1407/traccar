import React from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { getInstallerTip } from "@/lib/telematics/installerTroubleshooting";
import { businessText } from "@/components/telematics/command-test/businessLanguage";

const NEON_GREEN = "#50C878";
const RED = "#FF453A";
const AMBER = "#FF9F0A";

const AUTO_TESTS = [
  ["device_online", "📡", "Device Online"],
  ["power_voltage_test", "⚡", "Power"],
  ["gps_signal_test", "🛰️", "GPS Signal"],
  ["ignition_acc_test", "🔌", "Ignition"],
];

const COMMAND_TESTS = [
  ["lock_test", "lock", "🔑", "Lock"],
  ["unlock_test", "unlock", "🔓", "Unlock"],
  ["horn_test", "horn", "📢", "Horn"],
  ["lights_test", "lights", "💡", "Lights"],
  ["alarm_test", "alarm_pulse", "🔔", "Alarm"],
  ["starter_disable_test", "disable_starter", "⛔", "Starter Disable"],
  ["starter_restore_test", "restore_starter", "✅", "Starter Restore"],
];

function cardStyle(status, isTesting) {
  const base = {
    borderRadius: 14,
    padding: "14px 10px",
    background: "#1C1C1E",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    position: "relative",
    minHeight: 76,
    transition: "all 0.3s ease",
  };
  if (status === "pass") return { ...base, border: `2px solid ${NEON_GREEN}`, boxShadow: `0 0 12px ${NEON_GREEN}40` };
  if (status === "fail") return { ...base, border: `2px solid ${RED}`, boxShadow: `0 0 12px ${RED}40` };
  if (isTesting) return { ...base, border: "2px solid transparent" };
  return { ...base, border: "1px solid rgba(255,255,255,0.08)" };
}

function CommandCard({ icon, label, status, isTesting, isChecking, onClick, disabled, failHint }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        className={isTesting || isChecking ? "monitoring-ring" : ""}
        style={{
          ...cardStyle(status, isTesting || isChecking),
          "--ring-color": isChecking ? `${NEON_GREEN}99` : `${AMBER}cc`,
          cursor: onClick && !disabled ? "pointer" : "default",
        }}
        onClick={onClick && !disabled ? onClick : undefined}
      >
        {status === "pass" ? (
          <CheckCircle2 size={22} color={NEON_GREEN} />
        ) : status === "fail" ? (
          <XCircle size={22} color={RED} />
        ) : isTesting || isChecking ? (
          <Loader2 size={20} className="animate-spin" color={AMBER} />
        ) : (
          <span style={{ fontSize: 22 }}>{icon}</span>
        )}
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: status === "pass" ? NEON_GREEN : status === "fail" ? RED : "#F5F5F7",
          textAlign: "center",
        }}>
          {status === "pass" ? "Passed" : status === "fail" ? "Failed" : isTesting ? "Testing…" : isChecking ? "Checking…" : label}
        </span>
      </div>
      {status === "fail" && failHint && (
        <div style={{ padding: "6px 10px", background: `${RED}1A`, borderRadius: 8, fontSize: 10, color: "#FF6961", lineHeight: 1.4 }}>
          {failHint}
        </div>
      )}
    </div>
  );
}

export default function CommandTestTable({ form, update, capabilities, commandState, activeCommand, onSendCommand }) {
  const autoChecks = capabilities.data?.auto_checks || {};
  const tests = capabilities.data?.tests || {};
  const busy = !!activeCommand;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Auto checks */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#8E8E93", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>Auto Checks</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {AUTO_TESTS.map(([id, icon, label]) => {
            const check = autoChecks[id] || { status: form[id] || "" };
            const value = check.status || form[id] || "";
            const isChecking = !value && capabilities.isFetching;
            return (
              <CommandCard
                key={id}
                icon={icon}
                label={label}
                status={value === "pass" ? "pass" : value === "fail" ? "fail" : ""}
                isChecking={isChecking}
              />
            );
          })}
        </div>
      </div>

      {/* Command tests */}
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#8E8E93", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>Tap to Test</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {COMMAND_TESTS.map(([id, command, icon, label]) => {
            const supported = tests[id] !== false;
            if (!supported) return null;
            const value = form[id];
            const state = commandState[command]?.status || "Ready";
            const isCurrent = activeCommand === command;
            const locked = busy && !isCurrent;
            const isTesting = state === "Sending" || state === "Waiting";
            const failed = value === "fail" || state === "Failed";
            const failHint = failed ? businessText(commandState[command]?.error || getInstallerTip(id)) : null;
            return (
              <CommandCard
                key={id}
                icon={icon}
                label={label}
                status={value === "pass" ? "pass" : failed ? "fail" : ""}
                isTesting={isTesting}
                disabled={locked || isTesting || value === "pass"}
                failHint={failHint}
                onClick={() => !value && onSendCommand(command, id)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}