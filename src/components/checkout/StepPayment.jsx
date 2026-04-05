import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { CreditCard, Shield, Lock, Check, RefreshCw, Zap, AlertCircle } from "lucide-react";

// ─── Inner form — lives inside <Elements> ────────────────────────────────────
function PaymentForm({ booking, user, onPaymentSuccess, paymentIntentId, stripeCustomerId, amountDue }) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [paid, setPaid] = useState(false);
  const [autopay, setAutopay] = useState(booking?.autopay_enabled ?? true);
  const [recurringAgreed, setRecurringAgreed] = useState(false);
  const queryClient = useQueryClient();
  const submittedRef = useRef(false);
  const logEvent = useMutation({ mutationFn: (d) => base44.entities.ActivityEvent.create(d) });
  const markBooked = useMutation({ mutationFn: ({ id }) => base44.entities.Vehicle.update(id, { status: "Booked" }) });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements || !ready || processing || submittedRef.current) return;
    submittedRef.current = true;
    setProcessing(true);
    setError(null);

    // Timeout wrapper: if confirmPayment takes >15s, fail and reset
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Payment processing timeout")), 15000);
    });

    try {
      const { error: stripeErr, paymentIntent } = await Promise.race([
        stripe.confirmPayment({
          elements,
          redirect: "if_required",
          confirmParams: {
            return_url: `${window.location.origin}/checkout?request=${booking?.id}`,
            billing_details: {
              name: booking?.customer_full_name || user?.full_name || "Customer",
              email: user?.email,
              phone: booking?.customer_phone || user?.phone || "",
              address: { country: "US" },
            },
          },
        }),
        timeoutPromise,
      ]);

      clearTimeout(timeoutId);

      if (stripeErr) {
        setError(stripeErr.message);
        setProcessing(false);
        submittedRef.current = false;
        return;
      }

      const status = paymentIntent?.status;
      if (status === "succeeded" || status === "requires_capture") {
        setPaid(true);
        if (booking?.vehicle_id) await markBooked.mutateAsync({ id: booking.vehicle_id }).catch(() => {});
        await logEvent.mutateAsync({
          user_email: user?.email,
          booking_request_id: booking?.id,
          event_type: "payment_received",
          event_title: "First Payment Received",
          event_description: `$${amountDue} initial payment via Stripe`,
          event_status: "success",
          amount: amountDue,
        }).catch(() => {});

        const agreementMeta = {
          agreement_accepted_at: new Date().toISOString(),
          agreement_ip_address: "captured-server-side",
          agreement_device_info: navigator.userAgent || "unknown",
          agreement_version: "v1.0",
          payment_accepted_recurring_notice: recurringAgreed,
        };

        base44.functions.invoke("sendPaymentReceipt", {
          booking_request_id: booking?.id,
          user_email: user?.email,
          amount: amountDue,
          vehicle_name: booking?.vehicle_name,
          booking_type: booking?.booking_type,
          weekly_rate: booking?.weekly_rate,
        }).catch(() => {});

        onPaymentSuccess({
          payment_status: "paid",
          booking_status: "pending_review",
          stripe_payment_intent_id: paymentIntentId,
          stripe_customer_id: stripeCustomerId,
          stripe_payment_method_id: paymentIntent.payment_method || null,
          autopay_enabled: autopay,
          total_due_now: amountDue,
          submitted_at: new Date().toISOString(),
          viewed_by_admin: false,
          pending_review_alert_active: true,
          admin_attention_priority: "high",
          ...agreementMeta,
        });
        queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      } else if (status === "processing") {
        setError("Payment is still processing. Check your bookings page in a moment.");
        setProcessing(false);
        submittedRef.current = false;
      } else {
        setError(`Payment failed (status: ${status || "unknown"}). Please try again.`);
        setProcessing(false);
        submittedRef.current = false;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      setError(err.message || "Payment failed. Please try again.");
      setProcessing(false);
      submittedRef.current = false;
    }
  };

  if (paid) {
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
    <form onSubmit={handleSubmit}>
      <div className="mb-4 p-4 rounded-2xl border border-gray-200 bg-white relative min-h-[160px]">
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/95 rounded-2xl z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
              <p className="text-xs text-gray-500">Loading payment form…</p>
            </div>
          </div>
        )}
        <PaymentElement
          options={{
            layout: "tabs",
            paymentMethodOrder: ["card", "us_bank_account"],
            wallets: { applePay: "auto", googlePay: "auto" },
            fields: { billingDetails: "never" },
          }}
          onReady={() => { console.log("[Stripe] PaymentElement ready"); setReady(true); }}
          onLoadError={(e) => { console.error("[Stripe] PaymentElement load error", e); setReady(false); }}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <button type="button" onClick={() => setAutopay(!autopay)}
        className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50 text-left mb-5">
        <div className={`h-5 w-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${autopay ? "border-pink-500 bg-pink-500" : "border-gray-300"}`}>
          {autopay && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Zap className="h-3.5 w-3.5 text-pink-500" />Enable Autopay</p>
          <p className="text-xs text-gray-400">Save card &amp; auto-charge future payments</p>
        </div>
      </button>

      {/* Recurring billing notice — dispute prevention */}
      <div className="mb-4 p-3 rounded-xl border border-blue-100 bg-blue-50">
        <p className="text-xs font-semibold text-blue-800 mb-1.5">📋 Recurring Billing Notice</p>
        <p className="text-xs text-blue-700 mb-2">
          By paying, you authorize uRide to charge <strong>${amountDue}</strong> today
          {booking?.auto_renew && booking?.weekly_rate ? <> and <strong>${booking.weekly_rate}</strong> automatically each {booking.booking_type === "Weekly" ? "week" : "period"}</> : ""}.
          {" "}You may cancel anytime through your account.
        </p>
        <button type="button" onClick={() => setRecurringAgreed(!recurringAgreed)}
          className="flex items-start gap-2 w-full text-left">
          <div className={`h-4 w-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${recurringAgreed ? "border-blue-600 bg-blue-600" : "border-blue-300"}`}>
            {recurringAgreed && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
          <span className="text-xs text-blue-700 font-medium">I understand and agree to the recurring charge terms above</span>
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <Shield className="h-4 w-4 text-green-600" />
        <Lock className="h-3 w-3 text-gray-400" />
        <p className="text-xs text-gray-400">Secured by Stripe · PCI DSS compliant · Card details never touch our servers</p>
      </div>

      <button
        type="submit"
        disabled={!ready || processing || !recurringAgreed}
        className="w-full py-4 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
        {processing
          ? <><RefreshCw className="w-4 h-4 animate-spin" />Processing…</>
          : !ready
          ? <><RefreshCw className="w-4 h-4 animate-spin" />Loading…</>
          : !recurringAgreed
          ? <>⚠️ Please agree to billing terms above</>
          : <><CreditCard className="w-4 h-4" />Pay ${amountDue.toLocaleString()} Securely</>
        }
      </button>
    </form>
  );
}

// ─── Outer wrapper ─────────────────────────────────────────────────────────────
export default function StepPayment({ booking, user, saveAndAdvance, onPaymentSuccess }) {
  const [stripeInstance, setStripeInstance] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const initialized = useRef(false);

  const amountDue = booking?.total_due_now || booking?.weekly_rate || 0;
  const amountCents = Math.round(amountDue * 100);

  // If already paid (e.g. page refresh), skip straight to confirmation
  useEffect(() => {
    if (booking?.payment_status === "paid" && !initialized.current) {
      saveAndAdvance({}, "confirmation");
    }
  }, []); // eslint-disable-line

  const init = async () => {
    setLoading(true);
    setError(null);
    initialized.current = true;

    try {
      // Step 1: get publishable key and AWAIT the stripe object immediately
      const pkRes = await base44.functions.invoke("stripePublishableKey", {});
      const pk = pkRes.data?.publishable_key;
      if (!pk) throw new Error("Missing Stripe publishable key");

      // Await loadStripe here so we store the actual Stripe instance, not a promise
      const stripe = await loadStripe(pk);
      if (!stripe) throw new Error("Stripe failed to initialize");
      console.log("[Stripe] instance loaded:", typeof stripe);
      setStripeInstance(stripe);

      // Step 2: create PaymentIntent
      const piRes = await base44.functions.invoke("stripeCreatePaymentIntent", {
        booking_request_id: booking.id,
        amount_cents: amountCents,
        booking_type: booking.booking_type,
        setup_future_usage: "off_session",
      });
      const secret = piRes.data?.client_secret;
      if (!secret) throw new Error("No client_secret returned");
      console.log("[Stripe] clientSecret received, last4:", secret.slice(-4));
      setClientSecret(secret);
      setPaymentIntentId(piRes.data.payment_intent_id);
      setStripeCustomerId(piRes.data.stripe_customer_id);
    } catch (err) {
      console.error("[Stripe] init error:", err.message);
      setError("Payment setup failed: " + err.message);
      initialized.current = false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!booking?.id || initialized.current) return;
    if (amountCents < 50) {
      setError(`Amount too low ($${amountDue}). Please contact support.`);
      setLoading(false);
      return;
    }
    init();
  }, [booking?.id]); // eslint-disable-line

  const stripeOptions = useMemo(() => {
    if (!clientSecret) return null;
    return {
      clientSecret,
      appearance: {
        theme: "stripe",
        variables: { colorPrimary: "hsl(338, 90%, 56%)", borderRadius: "12px", fontFamily: "Inter, sans-serif" },
      },
      paymentMethodOrder: ["card", "us_bank_account"],
    };
  }, [clientSecret]);

  const handlePaymentSuccess = onPaymentSuccess || saveAndAdvance;

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="h-12 w-12 rounded-2xl bg-green-50 flex items-center justify-center">
          <CreditCard className="h-6 w-6 text-green-600" />
        </div>
        <div>
          <h2 className="font-bold text-gray-900 text-xl">Pay with Card</h2>
          <p className="text-gray-400 text-sm">Powered by Stripe · Encrypted &amp; secure</p>
        </div>
      </div>

      <div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl border border-pink-100 p-4 mb-5">
        <p className="text-sm text-gray-500 mb-1">Due Today</p>
        <p className="text-3xl font-bold text-gray-900">${amountDue.toLocaleString()}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span>{booking?.booking_type} rental</span>
          {booking?.weekly_rate && <><span>·</span><span>Weekly: ${booking.weekly_rate}</span></>}
        </div>
        <p className="text-xs text-gray-400 mt-1">Booking stays <strong>Pending Review</strong> until admin approves</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold mb-1">Payment setup error</p>
            <p>{error}</p>
            <button
              onClick={() => { initialized.current = false; init(); }}
              className="mt-2 text-xs font-bold text-pink-600 underline"
            >Try again</button>
          </div>
        </div>
      ) : stripeInstance && stripeOptions ? (
        <Elements stripe={stripeInstance} options={stripeOptions} key={clientSecret}>
          <PaymentForm
            booking={booking}
            user={user}
            onPaymentSuccess={handlePaymentSuccess}
            paymentIntentId={paymentIntentId}
            stripeCustomerId={stripeCustomerId}
            amountDue={amountDue}
          />
        </Elements>
      ) : (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}