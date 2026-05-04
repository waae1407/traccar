import React, { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { base44 } from "@/api/base44Client";
import { CreditCard, Loader2, X, Sparkles, Lock } from "lucide-react";

let stripePromise = null;
async function getStripe() {
  if (!stripePromise) {
    const res = await base44.functions.invoke("stripePublishableKey", {});
    stripePromise = loadStripe(res.data.publishable_key);
  }
  return stripePromise;
}

function CardForm({ onSuccess, onCancel, generating }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setLoading(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);
    const { paymentMethod, error: pmError } = await stripe.createPaymentMethod({
      type: "card",
      card: cardElement,
    });

    if (pmError) {
      setError(pmError.message);
      setLoading(false);
      return;
    }

    onSuccess(paymentMethod.id);
    setLoading(false);
  };

  const isProcessing = loading || generating;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-2">Card Details</label>
        <div className="px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus-within:border-pink-400 transition-colors">
          <CardElement options={{
            style: {
              base: { fontSize: "14px", color: "#111827", fontFamily: "Inter, sans-serif", "::placeholder": { color: "#9ca3af" } },
              invalid: { color: "#ef4444" },
            },
          }} />
        </div>
      </div>

      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

      <button type="submit" disabled={!stripe || isProcessing}
        className="w-full py-3 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        {isProcessing
          ? <><Loader2 className="h-4 w-4 animate-spin" />{generating ? "Generating…" : "Processing…"}</>
          : <><CreditCard className="h-4 w-4" /> Pay $5.00 & Generate</>}
      </button>

      <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-400">
        <Lock className="h-3 w-3" /> Secured by Stripe · Charged once per generation
      </div>
    </form>
  );
}

export default function LogoPaymentModal({ onSuccess, onCancel, generating }) {
  const [stripeInstance, setStripeInstance] = useState(null);

  useEffect(() => {
    getStripe().then(setStripeInstance);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-black text-gray-900 text-lg" style={{ fontFamily: "var(--font-syne)" }}>Unlock Generation</h3>
            <p className="text-xs text-gray-400 mt-0.5">You've used your 2 free generations</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Price badge */}
        <div className="p-4 rounded-2xl text-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.08), hsl(265 80% 62% / 0.08))", border: "1px solid hsl(338 90% 56% / 0.15)" }}>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-pink-500" />
            <p className="text-3xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>$5.00</p>
          </div>
          <p className="text-xs text-gray-500">per additional AI generation</p>
        </div>

        {/* Stripe Elements */}
        {stripeInstance ? (
          <Elements stripe={stripeInstance}>
            <CardForm onSuccess={onSuccess} onCancel={onCancel} generating={generating} />
          </Elements>
        ) : (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}