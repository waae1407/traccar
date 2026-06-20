import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export const PHASES = {
  idle: null,
  contacting: "contacting",   // gate hold — shown from click until API returns + 0.5s
  success: "success",
  failed: "failed",
};

const SUCCESS_STATUSES = new Set(["acknowledged", "executed", "delivered", "confirmed"]);
const FAIL_STATUSES = new Set(["failed", "expired", "blocked"]);
const SENDING_STATUSES = new Set(["sending", "sent", "queued"]);

// Command result labels
export const COMMAND_SUCCESS_LABEL = {
  lock: "Locked",
  unlock: "Unlocked",
  locate: "Located",
  horn: "Horn On",
  lights: "Lights On",
  horn_lights: "Horn & Lights On",
  alarm_pulse: "Alert On",
  disable_starter: "Starter Disabled",
  restore_starter: "Starter Restored",
  status: "Status Received",
};

export const COMMAND_FAIL_LABEL = {
  lock: "Not Locked",
  unlock: "Not Unlocked",
  locate: "Not Located",
  horn: "No Horn",
  lights: "No Lights",
  horn_lights: "No Response",
  alarm_pulse: "Alert Failed",
  disable_starter: "Not Disabled",
  restore_starter: "Not Restored",
  status: "No Status",
};

// Web Audio chimes
function playChime(success) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (success) {
      // Pleasant two-tone success chime
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.35);
      });
    } else {
      // Low dull tone for failure
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 220;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    }
  } catch {
    // Audio not available — silently skip
  }
}

export function useCommandProgress() {
  // buttonStates: { [commandType]: { phase, label } }
  const [buttonStates, setButtonStates] = useState({});
  const [activeCommand, setActiveCommand] = useState(null); // which button is in "contacting" state
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const clearPolling = useCallback(() => {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  }, []);

  const setButtonResult = useCallback((cmdType, phase, label) => {
    setButtonStates(prev => ({ ...prev, [cmdType]: { phase, label } }));
    setActiveCommand(null);
  }, []);

  // Step 1: immediately show "contacting" on button click
  const startOptimistic = useCallback((cmdType) => {
    clearPolling();
    setActiveCommand(cmdType);
    // Clear any previous result for this button
    setButtonStates(prev => ({ ...prev, [cmdType]: null }));
  }, [clearPolling]);

  // Step 2: API returned — wait 0.5s, show result, play chime, start polling for ACK
  const transitionToPolling = useCallback((cmdType, cmdId) => {
    // Poll for device ACK
    if (cmdId) {
      pollRef.current = setInterval(async () => {
        try {
          const records = await base44.entities.TelematicsCommand.filter({ id: cmdId });
          const rec = records?.[0];
          if (!rec) return;
          const qs = rec.queue_status || rec.status;

          if (SUCCESS_STATUSES.has(qs)) {
            clearPolling();
            setTimeout(() => {
              playChime(true);
              setButtonResult(cmdType, PHASES.success, COMMAND_SUCCESS_LABEL[cmdType] || "Done");
            }, 500);
            return;
          }
          if (FAIL_STATUSES.has(qs)) {
            clearPolling();
            setTimeout(() => {
              playChime(false);
              setButtonResult(cmdType, PHASES.failed, COMMAND_FAIL_LABEL[cmdType] || "Failed");
            }, 500);
            return;
          }
        } catch {
          // ignore poll errors
        }
      }, 1500);

      // Timeout after 30s with no ACK — treat as failed
      timerRef.current = setTimeout(() => {
        clearPolling();
        setTimeout(() => {
          playChime(false);
          setButtonResult(cmdType, PHASES.failed, COMMAND_FAIL_LABEL[cmdType] || "No Response");
        }, 500);
      }, 30000);
    } else {
      // No command ID to poll — show success optimistically after 0.5s
      setTimeout(() => {
        playChime(true);
        setButtonResult(cmdType, PHASES.success, COMMAND_SUCCESS_LABEL[cmdType] || "Done");
      }, 500);
    }
  }, [clearPolling, setButtonResult]);

  const reset = useCallback((cmdType) => {
    if (cmdType) {
      setButtonStates(prev => ({ ...prev, [cmdType]: null }));
    } else {
      setButtonStates({});
    }
    setActiveCommand(null);
    clearPolling();
  }, [clearPolling]);

  useEffect(() => () => clearPolling(), [clearPolling]);

  return { buttonStates, activeCommand, startOptimistic, transitionToPolling, reset, PHASES };
}