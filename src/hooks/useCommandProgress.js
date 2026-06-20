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

  // Clear all intervals
  const clearAll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Reset everything to initial state
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

  // Start polling for command status
  const startPolling = useCallback((cmdId) => {
    if (!cmdId) return;
    
    // Clear any existing poll
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    
    pollRef.current = setInterval(async () => {
      try {
        const records = await base44.entities.TelematicsCommand.filter({ id: cmdId });
        const rec = records?.[0];
        if (!rec) return;
        
        const qs = rec.queue_status || rec.status;
        
        if (SUCCESS_STATUSES.has(qs)) {
          setPhase(PHASES.success);
          clearAll();
          return;
        }
        
        if (FAIL_STATUSES.has(qs)) {
          setErrorMessage(rec.failure_reason || "Vehicle didn't respond");
          setPhase(PHASES.failed);
          clearAll();
          return;
        }
        
        if (SENDING_STATUSES.has(qs)) {
          setPhase(PHASES.vehicle_responding);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 1500);
  }, [clearAll]);

  // Show "Contacting vehicle…" immediately on button click
  const startOptimistic = useCallback((cmdType) => {
    clearAll();
    setCommandType(cmdType);
    setCommandId(null);
    setErrorMessage(null);
    setPhase(PHASES.contacting);
    startTimeRef.current = Date.now();
    phaseStartRef.current = Date.now();
    setElapsed(0);
    setPhaseElapsed(0);
    
    // Start elapsed timer
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      setPhaseElapsed(Math.floor((Date.now() - phaseStartRef.current) / 1000));
    }, 500);
  }, [clearAll]);

  // Called once API responds — gate hold is done, now poll for device ACK
  const transitionToPolling = useCallback((cmdType, cmdId) => {
    setCommandType(cmdType);
    setCommandId(cmdId);
    setPhase(PHASES.vehicle_responding);
    phaseStartRef.current = Date.now();
    setPhaseElapsed(0);
    startPolling(cmdId);
  }, [startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAll();
  }, [clearAll]);

  return { 
    phase, 
    elapsed, 
    phaseElapsed, 
    commandType, 
    commandId, 
    errorMessage, 
    lastHeartbeatAge, 
    startOptimistic, 
    transitionToPolling, 
    reset 
  };
}