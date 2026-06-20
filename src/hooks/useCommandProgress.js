import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

// 3-state phases: contacting → vehicle_responding → success/failed
export const PHASES = {
  idle: "idle",
  contacting: "contacting",           // gate hold — waiting for fresh heartbeat
  vehicle_responding: "vehicle_responding",  // command sent, waiting for device ACK
  success: "success",                 // acknowledged / executed
  failed: "failed",
};

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

  const startTimers = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      setPhaseElapsed(Math.floor((Date.now() - phaseStartRef.current) / 1000));
    }, 500);
  }, []);

  const startPolling = useCallback((cmdId) => {
    if (!cmdId) return;
    pollRef.current = setInterval(async () => {
      try {
        const records = await base44.entities.TelematicsCommand.filter({ id: cmdId });
        const rec = records?.[0];
        if (!rec) return;
        const qs = rec.queue_status || rec.status;
        if (SUCCESS_STATUSES.has(qs)) {
          advancePhase(PHASES.success);
          clearAll();
          return;
        }
        if (FAIL_STATUSES.has(qs)) {
          setErrorMessage(rec.failure_reason || "Vehicle didn't respond");
          advancePhase(PHASES.failed);
          clearAll();
          return;
        }
        if (SENDING_STATUSES.has(qs)) {
          advancePhase(PHASES.vehicle_responding);
        }
      } catch {
        // ignore poll errors silently
      }
    }, 1500);
  }, [clearAll, advancePhase]);

  // Show "Contacting vehicle…" immediately on button click (before API returns)
  const startOptimistic = useCallback((cmdType) => {
    clearAll();
    setCommandType(cmdType);
    setCommandId(null);
    setErrorMessage(null);
    startTimeRef.current = Date.now();
    phaseStartRef.current = Date.now();
    setElapsed(0);
    setPhaseElapsed(0);
    advancePhase(PHASES.contacting);
    startTimers();
  }, [clearAll, advancePhase, startTimers]);

  // Called once API responds — gate hold is done, now poll for device ACK
  const transitionToPolling = useCallback((cmdType, cmdId) => {
    setCommandType(cmdType);
    setCommandId(cmdId);
    advancePhase(PHASES.vehicle_responding);
    startPolling(cmdId);
  }, [advancePhase, startPolling]);

  // Legacy start (kept for backward compat in CommandTestWorkspace)
  const start = useCallback((cmdType, cmdId, heartbeatFreshness) => {
    clearAll();
    setCommandType(cmdType);
    setCommandId(cmdId);
    setErrorMessage(null);
    startTimeRef.current = Date.now();
    phaseStartRef.current = Date.now();
    setElapsed(0);
    setPhaseElapsed(0);
    advancePhase(heartbeatFreshness?.waited ? PHASES.contacting : PHASES.vehicle_responding);
    startTimers();
    startPolling(cmdId);
  }, [clearAll, advancePhase, startTimers, startPolling]);

  useEffect(() => () => clearAll(), [clearAll]);

  return { phase, elapsed, phaseElapsed, commandType, commandId, errorMessage, lastHeartbeatAge, start, startOptimistic, transitionToPolling, reset };
}