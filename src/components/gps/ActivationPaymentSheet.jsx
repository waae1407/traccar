import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { X, CreditCard, Loader2, CheckCircle, AlertCircle, Shield } from "lucide-react";

function PaymentForm({ deviceId, stripeCustomerId, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !ready || processing) return;
    setProcessing(true);
    setError(null);

    try {
      const { error: setupError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: { return_url: window.location.href },
      });

      if (setupError) {
        setError(setupError.message);
        setProcessing(false);
        return;
      }

      const res = await base44.functions.invoke("activateGPSTrial", {
        device_id: deviceId,
        action: "confirm",
        payment_method_id: setupIntent.payment_method,
        stripe_customer_id: stripeCustomerId,
      });

      if (res.data?.error) {
        setError(res.data.error);
        setProcessing(false);
        return;
      }

      onSuccess?.();
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement onReady={() => setReady(true)} />
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <button
        type="submit"
        disabled={!ready || processing || !stripe}
        className="w-full rounded-xl py-3 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
      >
        {processing ? (
          <><Loader2 size={16} className="animate-spin" /> Activating…</>
        ) : (
          <><CreditCard size={16} /> Start Subscription — $14.99/mo</>
        )}
      </button>
    </form>
  );
}

export default function ActivationPaymentSheet({ deviceId, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  const [stripePromise, setStripePromise] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await base44.functions.invoke("activateGPSTrial", {
          device_id: deviceId,
          action: "prepare",
        });
        if (res.data?.error) {
          setError(res.data.error);
          setLoading(false);
          return;
        }
        setClientSecret(res.data.client_secret);
        setStripeCustomerId(res.data.stripe_customer_id);
        const stripeInstance = await loadStripe(res.data.publishable_key);
        setStripePromise(stripeInstance);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
    init();
  }, [deviceId]);

  const handleSuccess = () => {
    setSuccess(true);
    setTimeout(() => onSuccess?.(), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl bg-[hsl(222,28%,11%)] border border-white/10 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Activate GPS</h2>
              <p className="text-xs text-white/50">$14.99/month after free trial</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        )}

        {error && !loading && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <button onClick={onClose} className="w-full rounded-xl border border-white/10 py-2.5 text-sm text-white/70 hover:bg-white/5">
              Close
            </button>
          </div>
        )}

        {success && (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <CheckCircle size={32} className="text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Subscription Active!</h3>
            <p className="text-sm text-white/60">Your GPS is now fully activated. All features are unlocked.</p>
          </div>
        )}

        {!loading && !error && !success && clientSecret && stripePromise && (
          <>
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
              <p className="text-xs text-white/70">✅ 7-day free trial included</p>
              <p className="text-xs text-white/70">✅ Full GPS tracking & remote controls</p>
              <p className="text-xs text-white/70">✅ Cancel anytime — no commitment</p>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <PaymentForm
                deviceId={deviceId}
                stripeCustomerId={stripeCustomerId}
                onSuccess={handleSuccess}
              />
            </Elements>
          </>
        )}
      </div>
    </div>
  );
}