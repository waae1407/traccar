import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Clock, AlertCircle, X, Loader2, Package, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * TrialStatusBanner — 90-day free trial status + cancel flow.
 *
 * Shows:
 *   - trialing: days remaining + cancel button
 *   - cancelled: return window countdown + return instructions
 */
export default function TrialStatusBanner({ subscription, onCancelComplete }) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState(null);

  if (!subscription) return null;

  const status = subscription.subscription_status;

  // Only show for trialing or cancelled (with active return window)
  if (!['trialing', 'cancelled'].includes(status)) return null;

  // ── CANCELLED: show return window countdown ──
  if (status === 'cancelled') {
    if (!subscription.return_window_ends_at) return null;
    const returnEnd = new Date(subscription.return_window_ends_at);
    const daysLeft = Math.ceil((returnEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

    if (subscription.device_returned_at) {
      return (
        <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ background: 'rgba(48,209,88,0.08)', borderColor: 'rgba(48,209,88,0.25)' }}>
          <CheckCircle size={20} color="#30D158" className="flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-green-400">Device Returned — Account Closed</p>
            <p className="text-xs text-white/60 mt-0.5">No device fee charged. Thank you!</p>
          </div>
        </div>
      );
    }

    if (subscription.device_fee_charged_at) {
      return (
        <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ background: 'rgba(255,69,58,0.1)', borderColor: 'rgba(255,69,58,0.35)' }}>
          <AlertCircle size={20} color="#FF453A" className="flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-400">$100 Device Fee Charged</p>
            <p className="text-xs text-white/60 mt-0.5">Device was not returned within 14 days.</p>
          </div>
        </div>
      );
    }

    const isOverdue = daysLeft <= 0;
    return (
      <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ background: isOverdue ? 'rgba(255,69,58,0.1)' : 'rgba(255,159,10,0.1)', borderColor: isOverdue ? 'rgba(255,69,58,0.35)' : 'rgba(255,159,10,0.3)' }}>
        <Package size={20} color={isOverdue ? '#FF453A' : '#FF9F0A'} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: isOverdue ? '#FF453A' : '#FF9F0A' }}>
            {isOverdue ? 'Return window expired — device fee pending' : `Return device within ${daysLeft} day(s)`}
          </p>
          <p className="text-xs text-white/60 mt-0.5">
            Reply to your cancellation email for a prepaid return label. $100 fee if not received by {returnEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
          </p>
        </div>
      </div>
    );
  }

  // ── TRIALING: show days remaining + cancel ──
  const trialEnd = subscription.trial_end_at ? new Date(subscription.trial_end_at) : null;
  const daysRemaining = trialEnd ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;

  let bg, border, iconColor, title, message;
  if (daysRemaining <= 3) {
    bg = 'rgba(255,69,58,0.1)'; border = 'rgba(255,69,58,0.35)'; iconColor = '#FF453A';
    title = `Free Trial — ${daysRemaining} day(s) left!`;
    message = 'Your trial ends soon. $14.99/mo starts automatically. Cancel anytime.';
  } else if (daysRemaining <= 14) {
    bg = 'rgba(255,159,10,0.1)'; border = 'rgba(255,159,10,0.3)'; iconColor = '#FF9F0A';
    title = `Free Trial — ${daysRemaining} days left`;
    message = `$14.99/mo starts on ${trialEnd?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}. Cancel anytime.`;
  } else {
    bg = 'rgba(48,209,88,0.08)'; border = 'rgba(48,209,88,0.25)'; iconColor = '#30D158';
    title = `90-Day Free Trial Active — ${daysRemaining} days left`;
    message = 'Full GPS features included. $14.99/mo after trial. Cancel anytime — 14-day return window applies.';
  }

  const handleCancel = async () => {
    setCanceling(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('cancelGPSTrial', { subscription_id: subscription.id });
      if (res.data?.error) {
        setError(res.data.error);
        setCanceling(false);
        return;
      }
      setShowCancelConfirm(false);
      onCancelComplete?.();
    } catch (err) {
      setError(err.message);
      setCanceling(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border p-4 flex items-center gap-3" style={{ background: bg, borderColor: border }}>
        <Clock size={20} color={iconColor} className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: iconColor }}>{title}</p>
          <p className="text-xs text-white/60 mt-0.5">{message}</p>
        </div>
        <button
          onClick={() => setShowCancelConfirm(true)}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white/70 border border-white/10 hover:bg-white/5 flex-shrink-0 whitespace-nowrap"
        >
          <X size={14} /> Cancel
        </button>
      </div>

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(2,6,23,0.88)', backdropFilter: 'blur(8px)' }}>
          <div className="relative w-full max-w-md rounded-3xl bg-card border border-border p-6 space-y-5">
            <button onClick={() => setShowCancelConfirm(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
            <div className="flex justify-center pt-2">
              <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center">
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
            </div>
            <h3 className="text-xl font-syne font-bold text-white text-center">Cancel Your Trial?</h3>
            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              Your GPS services will stop immediately. You'll have <span className="text-white font-semibold">14 days</span> to return the device
              (prepaid label provided). If we don't receive it, a <span className="text-red-400 font-semibold">$100 device fee</span> will be charged to your card.
            </p>
            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowCancelConfirm(false)} disabled={canceling}>
                Keep Trial
              </Button>
              <Button
                className="flex-1 bg-red-500 hover:bg-red-600 text-white"
                onClick={handleCancel}
                disabled={canceling}
              >
                {canceling ? <><Loader2 className="w-4 h-4 animate-spin" /> Cancelling…</> : 'Yes, Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}