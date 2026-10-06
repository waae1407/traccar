import React from "react";
import { Loader2 } from "lucide-react";
import { getInstallerTip } from "@/lib/telematics/installerTroubleshooting";
import { businessText } from "@/components/telematics/command-test/businessLanguage";

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

function RowBorder(status) {
  if (status === "pass") return { border: "2px solid #30D158", boxShadow: "0 0 10px rgba(48,209,88,0.25)" };
  if (status === "fail") return { border: "2px solid #FF453A", boxShadow: "0 0 10px rgba(255,69,58,0.25)" };
  return { border: "1px solid rgba(255,255,255,0.08)" };
}

function StatusText({ value }) {
  if (value === "pass") return <span style={{ color: "#30D158", fontSize: 12, fontWeight: 700 }}>✓ Passed</span>;
  if (value === "fail") return <span style={{ color: "#FF453A", fontSize: 12, fontWeight: 700 }}>✕ Failed</span>;
  return <span style={{ color: "#8E8E93", fontSize: 12 }}>Ready</span>;
}

export default function CommandTestTable({ form, update, capabilities, commandState, activeCommand, onSendCommand }) {
  const autoChecks = capabilities.data?.auto_checks || {};
  const tests = capabilities.data?.tests || {};
  const busy = !!activeCommand;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {AUTO_TESTS.map(([id, icon, label]) => {
        const check = autoChecks[id] || { status: form[id] || "" };
        const value = check.status || form[id] || "";
        const isChecking = !value && capabilities.isFetching;
        return (
          <div key={id} className={isChecking ? "monitoring-ring" : ""} style={{
            ...RowBorder(value === "pass" ? "pass" : value === "fail" ? "fail" : "idle"),
            borderRadius: 12, padding: "10px 14px", background: "#1C1C1E",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            position: "relative", "--ring-color": "rgba(48,209,88,0.7)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7" }}>{label}</span>
            </div>
            {isChecking ? <Loader2 size={14} className="animate-spin" color="#30D158" /> : <StatusText value={value} />}
          </div>
        );
      })}

      {COMMAND_TESTS.map(([id, command, icon, label]) => {
        const supported = tests[id] !== false;
        if (!supported) return null;
        const value = form[id];
        const state = commandState[command]?.status || "Ready";
        const isCurrent = activeCommand === command;
        const locked = busy && !isCurrent;
        const isTesting = state === "Sending" || state === "Waiting";
        const failed = value === "fail" || state === "Failed";
        return (
          <div key={id}>
            <div className={isTesting ? "monitoring-ring" : ""} style={{
              ...RowBorder(value === "pass" ? "pass" : failed ? "fail" : "idle"),
              borderRadius: 12, padding: "10px 14px", background: "#1C1C1E",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              position: "relative", "--ring-color": "rgba(48,209,88,0.7)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7" }}>{label}</span>
              </div>
              <button
                onClick={() => !value && onSendCommand(command, id)}
                disabled={locked || isTesting || value === "pass"}
                style={{ background: "none", border: "none", cursor: "pointer", opacity: locked ? 0.4 : 1, padding: 0 }}
              >
                {isTesting ? <Loader2 size={14} className="animate-spin" color="#30D158" /> : <StatusText value={value} />}
              </button>
            </div>
            {failed && (
              <div style={{ marginTop: 4, padding: "8px 12px", background: "rgba(255,69,58,0.1)", borderRadius: 8, fontSize: 11, color: "#FF6961", lineHeight: 1.4 }}>
                {businessText(commandState[command]?.error || getInstallerTip(id))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}