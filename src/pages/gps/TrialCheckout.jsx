import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from "@/lib/AuthContext";
import AccountMenu from "@/components/shared/AccountMenu";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, ArrowLeft, Shield, Loader2, AlertCircle, Sparkles, Clock, Package, CreditCard } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import C360SignInInterstitial from '@/components/auth/C360SignInInterstitial';
import { isCustomDomainHost } from '@/components/host/storefront/CustomDomainGate';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";
const PRODUCT_IMG = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/4f05d3221_29FB89C9-50E3-48A5-A76D-C33D086036D1.png";

const TRIAL_DAYS = 90;
const MONTHLY_PRICE = 14.99;
const DEVICE_FEE = 100;

let stripePromise = null;
async function getStripe() {
  if (!stripePromise) {
    const res = await base44.functions.invoke('stripePublishableKey', {});
    stripePromise = loadStripe(res.data?.publishable_key || res.data);
  }
  return stripePromise;
}

function TrialPaymentForm({ clientSecret, onSuccess }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    // Confirm the SetupIntent — this collects the card but charges $0
    const { error: stripeError, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });

    if (stripeError) {
      setError(stripeError.message);
      setSubmitting(false);
      return;
    }

    if (setupIntent?.status === 'succeeded') {
      onSuccess(setupIntent.payment_method);
    } else {
      setError('Setup did not complete. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="p-4 rounded-xl border border-border bg-card/60">
        <PaymentElement />
      </div>
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      <Button type="submit" size="lg" className="w-full gradient-primary glow-sm font-bold" disabled={submitting || !stripe}>
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting your trial…</> : <><Sparkles className="w-4 h-4" /> Start My 90-Day Free Trial</>}
      </Button>
      <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
        <Shield className="w-3 h-3" /> Secured by Stripe — $0 charged today
      </p>
    </form>
  );
}

export default function TrialCheckout() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', shipping_address: '', billing_address: '', vehicle_use_type: 'personal' });
  const [sameBilling, setSameBilling] = useState(true);
  const [step, setStep] = useState('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [setupData, setSetupData] = useState(null);
  const [stripeInstance, setStripeInstance] = useState(null);
  const [trialResult, setTrialResult] = useState(null);
  const [showC360SignIn, setShowC360SignIn] = useState(false);
  const [stockQty, setStockQty] = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSignIn = () => {
    if (isCustomDomainHost()) setShowC360SignIn(true);
    else base44.auth.redirectToLogin('/gps/trial');
  };

  useEffect(() => {
    getStripe().then(setStripeInstance);
    base44.entities.GPSProduct.filter({ package_type: 'device_subscription', is_active: true }).then(prods => {
      setStockQty(typeof prods[0]?.inventory_count === 'number' ? prods[0].inventory_count : null);
    }).catch(() => {});
    if (user) {
      if (user.email) set('email', user.email);
      if (user.full_name) set('name', user.full_name);
    }
  }, [user]);

  const outOfStock = stockQty !== null && stockQty <= 0;

  // Step 1: Create SetupIntent (prepare for card collection)
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await base44.functions.invoke('stripeCreateSetupIntent', {});
      if (res.data?.error) {
        setError(res.data.error);
        setLoading(false);
        return;
      }
      setSetupData(res.data);
      setStep('payment');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  // Step 2: SetupIntent confirmed — now start the trial
  const handleSetupSuccess = async (paymentMethodId) => {
    setLoading(true);
    setError(null);

    try {
      const res = await base44.functions.invoke('startGPSTrial', {
        customer_name: form.name,
        customer_email: form.email,
        customer_phone: form.phone,
        shipping_address: form.shipping_address,
        billing_address: sameBilling ? form.shipping_address : form.billing_address,
        vehicle_use_type: form.vehicle_use_type,
        payment_method_id: paymentMethodId,
        stripe_customer_id: setupData?.stripe_customer_id,
      });

      if (res.data?.error) {
        setError(res.data.error);
        setLoading(false);
        return;
      }
      setTrialResult(res.data);
      setStep('success');
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  if (step === 'success' && trialResult) {
    const trialEnd = new Date(trialResult.trial_end);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <img src={LOGO} alt="Contactless360" className="h-10 mx-auto object-contain" />
          <h2 className="text-2xl font-syne font-bold text-white">Your Free Trial Has Started! 🎉</h2>
          <p className="text-muted-foreground">Order <span className="text-white font-mono font-bold">{trialResult.order_number}</span></p>

          <div className="glass rounded-2xl p-6 space-y-4 text-left">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="font-semibold text-white text-sm">Free Shipping</p>
                <p className="text-xs text-muted-foreground">Your device ships within 1-2 business days</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="font-semibold text-white text-sm">90-Day Free Trial</p>
                <p className="text-xs text-muted-foreground">Ends {trialEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-yellow-400" />
              <div>
                <p className="font-semibold text-white text-sm">${MONTHLY_PRICE}/mo after trial</p>
                <p className="text-xs text-muted-foreground">Auto-starts after 90 days. Cancel anytime.</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Cancel anytime. Return the device within 14 days of cancellation (prepaid label provided) or a ${DEVICE_FEE} device fee applies.
          </p>

          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/customer/gps"><Button className="gradient-primary">Go to My GPS</Button></Link>
            <Link to="/gps"><Button variant="outline">Back to GPS</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <Link to="/gps"><img src={LOGO} alt="Contactless360" className="h-8 object-contain" /></Link>
        <div className="flex items-center gap-3">
          <Link to="/gps" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Back
          </Link>
          {user
            ? <AccountMenu role={user.role === "admin" ? "admin" : user.role === "host" ? "host" : "user"} accountPath="/customer/gps" compact />
            : <Button variant="ghost" size="sm" onClick={handleSignIn}>Sign In</Button>
          }
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12 grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-3 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded-full px-3 py-1 text-xs font-bold">
              <Sparkles className="w-3 h-3" /> 90-DAY FREE TRIAL
            </div>
            <h1 className="text-2xl font-syne font-bold text-white">
              {step === 'payment' ? 'Add Your Card (No Charge Today)' : 'Start Your Free Trial'}
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === 'payment'
                ? 'We collect your card now so your subscription can start automatically after 90 days. $0 charged today.'
                : 'Free GPS device + 90 days of full features. Free shipping. Cancel anytime.'
              }
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {!user && step === 'form' && (
            <div className="glass rounded-2xl p-8 text-center space-y-4">
              <AlertCircle className="w-10 h-10 text-yellow-400 mx-auto" />
              <p className="text-sm text-muted-foreground">Sign in to start your free 90-day trial.</p>
              <Button onClick={handleSignIn} className="gradient-primary glow-sm">
                Sign In to Continue
              </Button>
            </div>
          )}

          {user && step === 'form' && (
            <form onSubmit={handleFormSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2"><Label>Full Name *</Label><Input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Smith" /></div>
                <div className="space-y-1"><Label>Email *</Label><Input required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" /></div>
                <div className="space-y-1"><Label>Phone *</Label><Input required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" /></div>
              </div>
              <div className="space-y-1"><Label>Shipping Address *</Label><Input required value={form.shipping_address} onChange={e => set('shipping_address', e.target.value)} placeholder="123 Main St, City, State ZIP" /></div>
              <p className="text-xs text-green-400 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Free shipping — device arrives in 1-2 business days
              </p>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="sameBilling" checked={sameBilling} onChange={e => setSameBilling(e.target.checked)} className="rounded" />
                <label htmlFor="sameBilling" className="text-sm text-muted-foreground">Billing address same as shipping</label>
              </div>
              {!sameBilling && (
                <div className="space-y-1"><Label>Billing Address *</Label><Input required value={form.billing_address} onChange={e => set('billing_address', e.target.value)} placeholder="123 Main St, City, State ZIP" /></div>
              )}
              <div className="space-y-1">
                <Label>Vehicle Use Type</Label>
                <Select value={form.vehicle_use_type} onValueChange={v => set('vehicle_use_type', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal Vehicle</SelectItem>
                    <SelectItem value="rental">Rental Fleet</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {outOfStock && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> GPS devices are temporarily out of stock. Please check back soon.
                </div>
              )}
              <Button type="submit" size="lg" className="w-full gradient-primary glow-sm font-bold" disabled={loading || outOfStock}>
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Preparing…</> : outOfStock ? 'Out of Stock' : <>Continue to Card Setup <ArrowLeft className="w-4 h-4 rotate-180" /></>}
              </Button>
            </form>
          )}

          {step === 'payment' && setupData?.client_secret && stripeInstance && (
            <Elements stripe={stripeInstance} options={{ clientSecret: setupData.client_secret, appearance: { theme: 'night' } }}>
              <TrialPaymentForm
                clientSecret={setupData.client_secret}
                onSuccess={handleSetupSuccess}
              />
            </Elements>
          )}
        </div>

        {/* TRIAL SUMMARY */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-2xl border-2 border-yellow-500/40 bg-gradient-to-br from-yellow-500/10 to-background p-6 space-y-4">
            <img src={PRODUCT_IMG} alt="Contactless360" className="w-full rounded-xl object-cover" />
            <div>
              <h3 className="font-syne font-bold text-white">Contactless360 GPS</h3>
              <p className="text-sm text-muted-foreground mt-1">Premium GPS tracking, anti-theft, and remote controls.</p>
            </div>
            <div className="space-y-2 text-sm border-t border-border pt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trial Duration</span>
                <span className="text-white font-bold">90 days FREE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-green-400 font-bold">FREE</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Charged Today</span>
                <span className="text-green-400 font-bold">$0.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">After Trial</span>
                <span className="text-white font-bold">${MONTHLY_PRICE}/mo</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between font-semibold">
                <span className="text-white">Device Fee (if not returned)</span>
                <span className="text-yellow-400">${DEVICE_FEE}</span>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card/40 p-4 space-y-2">
            <p className="text-xs font-semibold text-white mb-2">What's included:</p>
            {["Live GPS tracking", "Remote lock/unlock", "Smart immobilizer", "Geofence alerts", "Battery & smoke alerts", "24/7 monitoring"].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-3.5 h-3.5 text-yellow-400" /> {f}
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 space-y-2">
            <p className="text-xs text-yellow-300/80 leading-relaxed">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Cancel anytime. If you cancel, return the device within 14 days (prepaid label provided) or a ${DEVICE_FEE} device fee applies. No charge during your 90-day trial.
            </p>
          </div>
        </div>
      </div>

      {showC360SignIn && <C360SignInInterstitial onClose={() => setShowC360SignIn(false)} />}
    </div>
  );
}