import React from 'react';
import { Power, CheckCircle2, AlertTriangle, Clock, Zap } from 'lucide-react';

/**
 * Smart kill switch indicator that reconciles three signals:
 *  1. device.starter_disabled — payment/admin enforcement flag (intent)
 *  2. scorecard.relay_state    — physical relay state (open/closed/unknown), computed
 *                                by detectParasiteDraw from the last ACKed command
 *  3. scorecard.last_relay_command — the last relay command sent and presumably ACKed
 *     (starter_kill 007,1,1 | restore_starter 007,1,0 | power_save 019,0 | power_save_off 019,1)
 *
 * This gives the true starter state rather than trusting a single stale flag.
 */

function classify({ starterDisabled, relayState, lastCmd }) {
  const isKillCmd = lastCmd === 'starter_kill' || lastCmd === '007,1,1';
  const isRestoreCmd = lastCmd === 'restore_starter' || lastCmd === '007,1,0';
  const isPowerSaveCmd = lastCmd === 'power_save' || lastCmd === '019,0';

  // ── Unknown relay state — can't confirm physically ──
  if (relayState === 'unknown' || !relayState) {
    if (starterDisabled) {
      return {
        level: 'pending',
        icon: Clock,
        label: 'Kill Switch Pending',
        detail: 'Flag set · relay state unknown — analyze to confirm',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/25',
        iconColor: 'text-amber-400',
        labelColor: 'text-amber-300',
        detailColor: 'text-amber-400/60',
      };
    }
    return {
      level: 'unknown',
      icon: AlertTriangle,
      label: 'Kill Switch Unknown',
      detail: 'Relay state unknown — click Refresh to analyze',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/25',
      iconColor: 'text-amber-400',
      labelColor: 'text-amber-300',
      detailColor: 'text-amber-400/60',
    };
  }

  // ── Payment enforcement flag is SET ──
  if (starterDisabled) {
    if (relayState === 'open') {
      // Relay confirmed open — starter is physically blocked
      if (isKillCmd) {
        return {
          level: 'on_confirmed',
          icon: Power,
          label: 'Kill Switch ON',
          detail: 'Starter blocked · kill ACKed by device',
          bg: 'bg-red-500/10',
          border: 'border-red-500/25',
          iconColor: 'text-red-400',
          labelColor: 'text-red-300',
          detailColor: 'text-red-400/60',
        };
      }
      if (isPowerSaveCmd) {
        return {
          level: 'on_power_save',
          icon: Power,
          label: 'Kill Switch ON',
          detail: 'Starter blocked · power-save relay open',
          bg: 'bg-red-500/10',
          border: 'border-red-500/25',
          iconColor: 'text-red-400',
          labelColor: 'text-red-300',
          detailColor: 'text-red-400/60',
        };
      }
      return {
        level: 'on_confirmed',
        icon: Power,
        label: 'Kill Switch ON',
        detail: 'Starter blocked · relay open',
        bg: 'bg-red-500/10',
        border: 'border-red-500/25',
        iconColor: 'text-red-400',
        labelColor: 'text-red-300',
        detailColor: 'text-red-400/60',
      };
    }
    // relayState === 'closed' — flag set but relay is closed (last ACK was a restore)
    return {
      level: 'pending',
      icon: Clock,
      label: 'Kill Switch Pending',
      detail: 'Flag set · last ACK was restore — relay still closed',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/25',
      iconColor: 'text-amber-400',
      labelColor: 'text-amber-300',
      detailColor: 'text-amber-400/60',
    };
  }

  // ── No payment enforcement flag ──
  if (relayState === 'open') {
    // Relay is open but no kill flag — power-save or stale kill
    if (isKillCmd) {
      return {
        level: 'stale_kill',
        icon: AlertTriangle,
        label: 'Kill Switch Stale',
        detail: 'Flag cleared · relay still open from last kill — restore pending',
        bg: 'bg-yellow-500/10',
        border: 'border-yellow-500/25',
        iconColor: 'text-yellow-400',
        labelColor: 'text-yellow-300',
        detailColor: 'text-yellow-400/60',
      };
    }
    if (isPowerSaveCmd) {
      return {
        level: 'off_power_save',
        icon: CheckCircle2,
        label: 'Kill Switch OFF',
        detail: 'Starter enabled · power-save relay open (auto-closes on ignition)',
        bg: 'bg-emerald-500/8',
        border: 'border-emerald-500/20',
        iconColor: 'text-emerald-400',
        labelColor: 'text-emerald-300',
        detailColor: 'text-emerald-400/50',
      };
    }
    return {
      level: 'off_relay_open',
      icon: CheckCircle2,
      label: 'Kill Switch OFF',
      detail: 'Starter enabled · relay open (power-save)',
      bg: 'bg-emerald-500/8',
      border: 'border-emerald-500/20',
      iconColor: 'text-emerald-400',
      labelColor: 'text-emerald-300',
      detailColor: 'text-emerald-400/50',
    };
  }

  // relayState === 'closed' — starter enabled and relay closed
  if (isRestoreCmd) {
    return {
      level: 'off_confirmed',
      icon: CheckCircle2,
      label: 'Kill Switch OFF',
      detail: 'Starter enabled · restore ACKed by device',
      bg: 'bg-emerald-500/8',
      border: 'border-emerald-500/20',
      iconColor: 'text-emerald-400',
      labelColor: 'text-emerald-300',
      detailColor: 'text-emerald-400/50',
    };
  }
  return {
    level: 'off_confirmed',
    icon: CheckCircle2,
    label: 'Kill Switch OFF',
    detail: 'Starter enabled · relay closed',
    bg: 'bg-emerald-500/8',
    border: 'border-emerald-500/20',
    iconColor: 'text-emerald-400',
    labelColor: 'text-emerald-300',
    detailColor: 'text-emerald-400/50',
  };
}

export default function KillSwitchIndicator({ device, scorecard }) {
  const state = classify({
    starterDisabled: device?.starter_disabled === true,
    relayState: scorecard?.relay_state,
    lastCmd: scorecard?.last_relay_command,
  });
  const Icon = state.icon;

  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 border ${state.bg} ${state.border}`}>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${state.iconColor}`} />
      <span className={`text-xs font-bold ${state.labelColor}`}>{state.label}</span>
      <span className={`text-[10px] ${state.detailColor} truncate`}>{state.detail}</span>
    </div>
  );
}