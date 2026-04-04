import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CreditCard, Shield, Lock, Check, RefreshCw, Zap } from "lucide-react";

// Cache the Stripe promise so we only load it once per session
let cachedStripePromise = null;
async function getStripePromise() {
  if (cachedStripePromise) return cachedStripePromise;
  const res = await base44.functions.invoke("stripePublishableKey", {});
  const key = res.data?.publishable_key;
  if (!key) throw new Error("Missing Stripe publishable key");
  cachedStripePromise = loadStripe(key);
  return cachedStripePromise;
}

// Inner form — rendered inside <Elements>
function StripePaymentForm({ booking, user, saveAndAdvance, paymentIntentId, stripeCustomerId, autopay, setAutopay }) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(false);
  // Use a ref so re-renders caused by parent state changes don't reset the paid state
  const paidRef = useRef(false);
  const queryClient = useQueryClient();
  // Snapshot booking values at pay time so parent re-renders don't affect them
  const bookingRef = useRef(booking);

  const logEvent = useMutation({ mutationFn: (d) => base44.entities.ActivityEvent.create(d) });
  const markBooked = useMutation({ mutationFn: ({ id }) => base44.entities.Vehicle.update(id, { status: "Booked" }) });

  const handlePay = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || paidRef.current) return;
    setProcessing(true);
    setError(null);

    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (stripeError) {
      setError(stripeError.message);
      setProcessing(false);
      return;
    }

    if (paymentIntent?.status === "succeeded" || paymentIntent?.status === "requires_capture") {
      // Mark as paid immediately to prevent any re-render from showing the spinner again
      paidRef.current = true;
      setPaid(true);

      const snap = bookingRef.current;
      const payAmount = snap?.total_due_now || snap?.weekly_rate || 0;

      if (snap?.vehicle_id) {
        await markBooked.mutateAsync({ id: snap.vehicle_id });
      }

      await logEvent.mutateAsync({
        user_email: user?.email,
        booking_request_id: snap?.id,
        event_type: "payment_received",
        event_title: "First Payment Received",
        event_description: `$${payAmount} initial payment via Stripe`,
        event_status: "success",
        amount: payAmount,
      });

      saveAndAdvance({
        payment_status: "paid",
        booking_status: "pending_review",
        stripe_payment_intent_id: paymentIntentId,
        stripe_customer_id: stripeCustomerId,
        stripe_payment_method_id: paymentIntent.payment_method || null,
        autopay_enabled: autopay,
        total_due_now: payAmount,
        checkout_step: "confirmation",
        submitted_at: new Date().toISOString(),
        viewed_by_admin: false,
        pending_review_alert_active: true,
        admin_attention_priority: "high",
      }, "confirmation");

      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    }
  };

  if (paid || paidRef.current) {
    return (
      <div className="flex flex-col items-center py-12 text-center">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <Check className="h-8 w-8 text-green-600" />
        </div>
        <p className="font-bold text-gray-900 text-xl">Payment Successful!</p>
        <p className="text-gray-400 text-sm mt-1">Finalizing your booking…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handlePay}>
      <div className="mb-4 p-4 rounded-2xl border border-gray-200 bg-white">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>
      )}

      {/* Autopay toggle */}
      <button type="button" onClick={() => setAutopay(!autopay)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left mb-5">
        <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${autopay ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
          {autopay && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-pink-500" />Enable Autopay</p>
          <p className="text-xs text-gray-400">Save card & auto-charge future payments</p>
        </div>
      </button>

      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-4 w-4 text-green-600" />
        <Lock className="h-3 w-3 text-gray-400" />
        <p className="text-xs text-gray-400">Secured by Stripe · PCI DSS compliant · Card details never touch our servers</p>
      </div>

      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full py-4 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        {processing
          ? <><RefreshCw className="w-4 h-4 animate-spin" />Processing…</>
          : <><CreditCard className="w-4 h-4" />Pay ${(booking?.total_due_now || booking?.weekly_rate || 0).toLocaleString()} Securely</>
        }
      </button>
    </form>
  );
}

export default function StepPayment({ booking, user, saveAndAdvance }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  const [stripePromise, setStripePromise] = useState(null);
  const [autopay, setAutopay] = useState(booking?.autopay_enabled || false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const initialized = useRef(false);

  const amountDue = booking?.total_due_now || booking?.weekly_rate || 0;
  const amountCents = Math.round(amountDue * 100);

  useEffect(() => {
    if (!booking?.id || amountCents < 50 || initialized.current) {
      setLoading(false);
      return;
    }
    initialized.current = true;

    const init = async () => {
      try {
        const [sp, piRes] = await Promise.all([
          getStripePromise(),
          base44.functions.invoke("stripeCreatePaymentIntent", {
            booking_request_id: booking.id,
            amount_cents: amountCents,
            booking_type: booking.booking_type,
            setup_future_usage: "off_session",
          }),
        ]);

        setStripePromise(sp);

        if (piRes.data?.client_secret) {
          setClientSecret(piRes.data.client_secret);
          setPaymentIntentId(piRes.data.payment_intent_id);
          setStripeCustomerId(piRes.data.stripe_customer_id);
        } else {
          setError("Could not initialize payment. Please try again.");
        }
      } catch (err) {
        setError("Payment setup failed. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [booking?.id]);

  // Memoize options so the clientSecret reference never changes once set (prevents Elements re-mount)
  const stripeOptions = useMemo(() => clientSecret ? {
    clientSecret,
    appearance: {
      theme: "stripe",
      variables: { colorPrimary: "hsl(338, 90%, 56%)", borderRadius: "12px", fontFamily: "Inter, sans-serif" },
    },
  } : null, [clientSecret]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-2xl bg-green-50 flex items-center justify-center">
          <CreditCard className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">Pay with Card</h2>
          <p className="text-gray-400 text-sm">Powered by Stripe · Encrypted & secure</p>
        </div>
      </div>

      {/* Amount summary */}
      <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl border border-pink-100 p-4 mb-5">
        <p className="text-sm text-gray-500 mb-1">Due Today</p>
        <p className="text-3xl font-bold text-gray-900">${amountDue.toLocaleString()}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span>{booking?.booking_type} rental</span>
          {booking?.deposit_amount > 0 && <><span>·</span><span>Deposit: ${booking.deposit_amount}</span></>}
          {booking?.weekly_rate && <><span>·</span><span>Weekly: ${booking.weekly_rate}</span></>}
        </div>
        <p className="text-xs text-gray-400 mt-1">Booking stays <strong>Pending Review</strong> until admin approves</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 mb-4">{error}</div>
      ) : clientSecret && stripeOptions && stripePromise ? (
        <Elements stripe={stripePromise} options={stripeOptions}>
          <StripePaymentForm
            booking={booking}
            user={user}
            saveAndAdvance={saveAndAdvance}
            paymentIntentId={paymentIntentId}
            stripeCustomerId={stripeCustomerId}
            autopay={autopay}
            setAutopay={setAutopay}
          />
        </Elements>
      ) : (
        <div className="p-4 rounded-2xl bg-yellow-50 border border-yellow-100 text-sm text-yellow-700">
          Unable to load payment form. Please refresh and try again.
        </div>
      )}
    </div>
  );
}