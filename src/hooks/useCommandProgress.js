import { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";

export const PHASES = {
  idle: "idle",
  contacting: "contacting",
  vehicle_responding: "vehicle_responding",
  success: "success",
  failed: "failed",
};

const PENDING_STATUSES = new Set(["pending", "sending", "sent", "sent_to_traccar", "queued", "processing", "waiting"]);
const SUCCESS_STATUSES = new Set(["acknowledged", "executed", "delivered", "confirmed", "completed", "success", "done"]);
const FAIL_STATUSES = new Set(["failed", "expired", "blocked", "error", "rejected", "timeout"]);

export function useCommandProgress() {
  const [phase, setPhase] = useState(PHASES.idle);
  const [commandId, setCommandId] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [commandType, setCommandType] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [pollAttempts, setPollAttempts] = useState(0);

  const startTimeRef = useRef(null);
  const pollRef = useRef(null);
  const timerRef = useRef(null);
  const isPollingRef = useRef(false);

  const clearAll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  const reset = useCallback(() => {
    clearAll();
    setPhase(PHASES.idle);
    setCommandId(null);
    setElapsed(0);
    setCommandType(null);
    setErrorMessage(null);
    setPollAttempts(0);
    startTimeRef.current = null;
    isPollingRef.current = false;
  }, [clearAll]);

  const startPolling = useCallback((cmdId) => {
    if (!cmdId) return;
    if (isPollingRef.current) return;

    isPollingRef.current = true;
    setPollAttempts(0);

    const checkStatus = async () => {
      try {
        const records = await base44.entities.TelematicsCommand.filter({ id: cmdId });
        const rec = records?.[0];
        if (!rec) return;

        const queueStatus = rec.queue_status;
        const confirmationStatus = rec.confirmation_status;
        const status = rec.status;

        const anySuccess = [queueStatus, confirmationStatus, status].some(s => SUCCESS_STATUSES.has(s));
        if (anySuccess) {
          setPhase(PHASES.success);
          clearAll();
          return;
        }

        const anyFail = [queueStatus, confirmationStatus, status].some(s => FAIL_STATUSES.has(s));
        if (anyFail) {
          setErrorMessage(rec.failure_reason || "Vehicle didn't respond");
          setPhase(PHASES.failed);
          clearAll();
          return;
        }

        const anyPending = [queueStatus, confirmationStatus, status].some(s => PENDING_STATUSES.has(s));
        if (anyPending) {
          setPhase(PHASES.vehicle_responding);
        }

        setPollAttempts(prev => prev + 1);
        
        if (pollAttempts > 120) {
          setErrorMessage("Command timed out");
          setPhase(PHASES.failed);
          clearAll();
        }
      } catch (err) {
        console.error('[useCommandProgress] Poll error:', err);
        setPollAttempts(prev => prev + 1);
        if (pollAttempts > 5) {
          setErrorMessage("Connection error");
          setPhase(PHASES.failed);
          clearAll();
        }
      }
    };

    checkStatus();
    pollRef.current = setInterval(checkStatus, 1000);
  }, [clearAll, pollAttempts]);

  const startOptimistic = useCallback((cmdType) => {
    clearAll();
    setCommandType(cmdType);
    setCommandId(null);
    setErrorMessage(null);
    setPhase(PHASES.contacting);
    startTimeRef.current = Date.now();
    setElapsed(0);
    setPollAttempts(0);
    isPollingRef.current = false;
    
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 500);
  }, [clearAll]);

  const transitionToPolling = useCallback((cmdType, cmdId) => {
    setCommandType(cmdType);
    setCommandId(cmdId);
    setPhase(PHASES.vehicle_responding);
    startTimeRef.current = Date.now();
    setElapsed(0);
    startPolling(cmdId);
  }, [startPolling]);

  useEffect(() => {
    return () => clearAll();
  }, [clearAll]);

  return { 
    phase, 
    elapsed, 
    commandType, 
    commandId, 
    errorMessage, 
    pollAttempts,
    startOptimistic, 
    transitionToPolling, 
    reset,
    isPolling: isPollingRef.current
  };
}