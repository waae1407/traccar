import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CreditCard, Shield, Lock, Check, RefreshCw, Zap, AlertCircle } from "lucide-react";

// ─── Module-level caches (survive component remounts) ───────────────────────
let cachedStripePromise = null;
// Module-level paid flag — survives parent re-renders that unmount/remount this component
let modulePaymentSucceeded = false;
async function getStripePromise() {
  if (cachedStripePromise) return cachedStripePromise;
  const res = await base44.functions.invoke("stripePublishableKey", {});
  const key = res.data?.publishable_key;
  if (!key) throw new Error("Missing Stripe publishable key");
  cachedStripePromise = loadStripe(key);
  return cachedStripePromise;
}

// ─── Inner Stripe form ───────────────────────────────────────────────────────
function StripePaymentForm({ booking, user, onPaymentSuccess, paymentIntentId, stripeCustomerId }) {
  const [autopay, setAutopay] = useState(booking?.autopay_enabled || false);
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(modulePaymentSucceeded);
  const [elementMounted, setElementMounted] = useState(false);
  const [initError, setInitError] = useState(null);
  const paidRef = useRef(modulePaymentSucceeded);
  const processingTimeoutRef = useRef(null);
  const queryClient = useQueryClient();
  const paymentElementContainerRef = useRef(null);

  // Freeze booking snapshot at mount — never update mid-payment to avoid re-render disruption
  const bookingRef = useRef(booking);

  // Keep refs stable so callbacks always have latest values without causing re-renders
  const onPaymentSuccessRef = useRef(onPaymentSuccess);
  useEffect(() => { onPaymentSuccessRef.current = onPaymentSuccess; }, [onPaymentSuccess]);
  const paymentIntentIdRef = useRef(paymentIntentId);
  const stripeCustomerIdRef = useRef(stripeCustomerId);
  const autopayRef = useRef(autopay);
  autopayRef.current = autopay;

  // Safety valve: if processing stays true for >30s, reset it
  useEffect(() => {
    if (processing) {
      processingTimeoutRef.current = setTimeout(() => {
        setProcessing(false);
        setError("Payment timed out. Please try again.");
      }, 30_000);
    } else {
      clearTimeout(processingTimeoutRef.current);
    }
    return () => clearTimeout(processingTimeoutRef.current);
  }, [processing]);

  // Monitor PaymentElement mounting with observer
  useEffect(() => {
    if (!stripe || !elements) {
      console.log("[Payment] Stripe or elements not ready");
      return;
    }

    console.log("[Payment] Stripe and elements ready, waiting for PaymentElement DOM mount");
    
    // Check if payment element iframe has mounted by observing the DOM
    const checkForPaymentElement = setInterval(() => {
      const iframes = paymentElementContainerRef.current?.querySelectorAll("iframe");
      if (iframes && iframes.length > 0) {
        console.log("[Payment] PaymentElement iframe detected, marking as mounted");
        setElementMounted(true);
        setInitError(null);
        clearInterval(checkForPaymentElement);
      }
    }, 100);

    // If not mounted after 5 seconds, show error
    const timeoutId = setTimeout(() => {
      if (!elementMounted) {
        console.error("[Payment] PaymentElement failed to mount after 5s");
        setInitError("Secure payment form failed to load. Please refresh and try again.");
        clearInterval(checkForPaymentElement);
      }
    }, 5000);

    return () => {
      clearInterval(checkForPaymentElement);
      clearTimeout(timeoutId);
    };
  }, [stripe, elements]);

  const logEvent = useMutation({ mutationFn: (d) => base44.entities.ActivityEvent.create(d) });
  const markBooked = useMutation({ mutationFn: ({ id }) => base44.entities.Vehicle.update(id, { status: "Booked" }) });

  const handlePay = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !elementMounted || paidRef.current || processing) return;
    setProcessing(true);
    setError(null);

    let stripeError, paymentIntent;
    try {
      const result = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      stripeError = result.error;
      paymentIntent = result.paymentIntent;
    } catch (err) {
      console.error("stripe.confirmPayment threw:", err);
      setError(err?.message || "Payment failed unexpectedly. Please try again.");
      setProcessing(false);
      return;
    }

    if (stripeError) {
      setError(stripeError.message);
      setProcessing(false);
      return;
    }

    const status = paymentIntent?.status;

    if (status === "succeeded" || status === "requires_capture") {
      paidRef.current = true;
      modulePaymentSucceeded = true;
      setPaid(true);

      const snap = bookingRef.current;
      const payAmount = snap?.total_due_now || snap?.weekly_rate || 0;

      if (snap?.vehicle_id) {
        await markBooked.mutateAsync({ id: snap.vehicle_id }).catch(() => {});
      }

      await logEvent.mutateAsync({
        user_email: user?.email,
        booking_request_id: snap?.id,
        event_type: "payment_received",
        event_title: "First Payment Received",
        event_description: `$${payAmount} initial payment via Stripe`,
        event_status: "success",
        amount: payAmount,
      }).catch(() => {});

      onPaymentSuccessRef.current({
        payment_status: "paid",
        booking_status: "pending_review",
        stripe_payment_intent_id: paymentIntentIdRef.current,
        stripe_customer_id: stripeCustomerIdRef.current,
        stripe_payment_method_id: paymentIntent.payment_method || null,
        autopay_enabled: autopayRef.current,
        total_due_now: payAmount,
        submitted_at: new Date().toISOString(),
        viewed_by_admin: false,
        pending_review_alert_active: true,
        admin_attention_priority: "high",
      });

      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
    } else if (status === "processing") {
      // Stripe is still processing — poll for completion
      setError("Payment is processing. Please wait a moment and check your bookings for confirmation.");
      setProcessing(false);
    } else if (status === "requires_action") {
      // 3D Secure or bank redirect needed — Stripe should handle this automatically with redirect:"if_required"
      setError("Additional authentication required. Please follow the prompts from your bank.");
      setProcessing(false);
    } else {
      setError(`Payment could not be completed (status: ${status || "unknown"}). Please try again or use a different card.`);
      setProcessing(false);
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

  const canSubmit = elementMounted && !processing && !initError;

  return (
    <form onSubmit={handlePay}>
      {/* Payment Element Container */}
      <div ref={paymentElementContainerRef} className="mb-4 p-4 rounded-2xl border border-gray-200 bg-white min-h-[100px] relative">
        {!elementMounted && !initError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-xl z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
              <p className="text-xs text-gray-500">Loading payment form...</p>
            </div>
          </div>
        )}
        {initError && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/90 rounded-xl z-10">
            <div className="text-center px-4">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-red-600">{initError}</p>
            </div>
          </div>
        )}
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
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
        disabled={!canSubmit}
        className="w-full py-4 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        {processing
          ? <><RefreshCw className="w-4 h-4 animate-spin" />Processing…</>
          : initError
          ? <>Unable to load payment form</>
          : !elementMounted
          ? <><RefreshCw className="w-4 h-4 animate-spin" />Initializing payment…</>
          : <><CreditCard className="w-4 h-4" />Pay ${(booking?.total_due_now || booking?.weekly_rate || 0).toLocaleString()} Securely</>
        }
      </button>
    </form>
  );
}

// ─── Outer wrapper ────────────────────────────────────────────────────────────
export default function StepPayment({ booking, user, saveAndAdvance, onPaymentSuccess }) {
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  const [stripePromise, setStripePromise] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const initialized = useRef(false);

  // Reset module-level flag when this is a fresh payment mount (no prior success)
  useEffect(() => {
    if (booking?.payment_status !== "paid") {
      modulePaymentSucceeded = false;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const amountDue = booking?.total_due_now || booking?.weekly_rate || 0;
  const amountCents = Math.round(amountDue * 100);

  // If booking is already paid on mount (e.g. page reload after payment), skip to confirmation
  // Use a ref to only do this once, not on every re-render
  const skippedRef = useRef(false);
  useEffect(() => {
    if (!skippedRef.current && booking?.payment_status === "paid") {
      skippedRef.current = true;
      saveAndAdvance({}, "confirmation");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!booking?.id || initialized.current) {
      setLoading(false);
      return;
    }
    if (amountCents < 50) {
      setError(`Amount too low ($${amountDue}). Please contact support.`);
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
          setError("Could not initialize payment. Please refresh and try again.");
        }
      } catch (err) {
        setError("Payment setup failed. Please refresh and try again.");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [booking?.id]);

  // Memoize options so Elements never re-mounts after clientSecret is set
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
        <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 mb-4 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Payment setup error</p>
            <p>{error}</p>
            <button
              onClick={() => { initialized.current = false; setError(null); setLoading(true); }}
              className="mt-2 text-xs font-bold text-pink-600 underline"
            >
              Try again
            </button>
          </div>
        </div>
      ) : clientSecret && stripeOptions && stripePromise ? (
        <Elements stripe={stripePromise} options={stripeOptions}>
          <StripePaymentForm
            booking={booking}
            user={user}
            onPaymentSuccess={onPaymentSuccess || saveAndAdvance}
            paymentIntentId={paymentIntentId}
            stripeCustomerId={stripeCustomerId}
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