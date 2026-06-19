import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// Phases map to real queue_status transitions
export const PHASES = {
  idle: null,
  connecting: "connecting",   // gate hold — waiting for fresh heartbeat
  sending: "sending",         // Traccar API called
  waiting: "waiting",         // waiting for device ACK
  success: "success",         // acknowledged / executed
  failed: "failed",
};

const GATE_STATUSES = new Set(["queued"]);
const SENDING_STATUSES = new Set(["sending", "sent"]);
const SUCCESS_STATUSES = new Set(["acknowledged", "executed", "delivered", "confirmed"]);
const FAIL_STATUSES = new Set(["failed", "expired", "blocked"]);

export function useCommandProgress() {
  const [phase, setPhase] = useState(PHASES.idle);
  const [commandId, setCommandId] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [phaseElapsed, setPhaseElapsed] = useState(0);
  const [commandType, setCommandType] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastHeartbeatAge, setLastHeartbeatAge] = useState(null);

  const startTimeRef = useRef(null);
  const phaseStartRef = useRef(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const clearAll = useCallback(() => {
    clearInterval(pollRef.current);
    clearInterval(timerRef.current);
    pollRef.current = null;
    timerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    clearAll();
    setPhase(PHASES.idle);
    setCommandId(null);
    setElapsed(0);
    setPhaseElapsed(0);
    setCommandType(null);
    setErrorMessage(null);
    setLastHeartbeatAge(null);
    startTimeRef.current = null;
    phaseStartRef.current = null;
  }, [clearAll]);

  const advancePhase = useCallback((newPhase) => {
    setPhase(newPhase);
    phaseStartRef.current = Date.now();
    setPhaseElapsed(0);
  }, []);

  // Start tracking a new command
  const start = useCallback((cmdType, cmdId, heartbeatFreshness) => {
    clearAll();
    setCommandType(cmdType);
    setCommandId(cmdId);
    setErrorMessage(null);
    startTimeRef.current = Date.now();
    phaseStartRef.current = Date.now();
    setElapsed(0);
    setPhaseElapsed(0);

    // If we know from the response payload whether gate was triggered
    if (heartbeatFreshness?.waited) {
      setLastHeartbeatAge(heartbeatFreshness.age_ms);
      advancePhase(PHASES.connecting);
    } else {
      advancePhase(PHASES.sending);
    }

    // Elapsed timers
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      setPhaseElapsed(Math.floor((Date.now() - phaseStartRef.current) / 1000));
    }, 500);

    if (!cmdId) return;

    // Poll the command record every 1.5s
    pollRef.current = setInterval(async () => {
      try {
        const records = await base44.entities.TelematicsCommand.filter({ id: cmdId });
        const rec = records?.[0];
        if (!rec) return;

        const qs = rec.queue_status || rec.status;

        if (SUCCESS_STATUSES.has(qs)) {
          clearAll();
          advancePhase(PHASES.success);
          // Auto-dismiss success after 4s
          setTimeout(() => setPhase(PHASES.idle), 4000);
          return;
        }
        if (FAIL_STATUSES.has(qs)) {
          clearAll();
          setErrorMessage(rec.failure_reason || "Command failed");
          advancePhase(PHASES.failed);
          return;
        }
        if (SENDING_STATUSES.has(qs)) {
          if (phase !== PHASES.waiting) advancePhase(PHASES.waiting);
          return;
        }
        // Still queued — check if heartbeat was just matched (sent_to_traccar_at set)
        if (rec.sent_to_traccar_at && phase === PHASES.connecting) {
          advancePhase(PHASES.waiting);
        } else if (rec.command_released_at && phase === PHASES.connecting) {
          advancePhase(PHASES.sending);
        }
      } catch {
        // ignore poll errors silently
      }
    }, 1500);
  }, [clearAll, advancePhase, phase]);

  useEffect(() => () => clearAll(), [clearAll]);

  return { phase, elapsed, phaseElapsed, commandType, commandId, errorMessage, lastHeartbeatAge, start, reset };
}