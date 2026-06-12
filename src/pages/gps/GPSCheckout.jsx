import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from "@/lib/AuthContext";
import AccountMenu from "@/components/shared/AccountMenu";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Package, ArrowLeft, Shield, Loader2, AlertCircle, Tag } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";
const PRODUCT_IMG = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/4f05d3221_29FB89C9-50E3-48A5-A76D-C33D086036D1.png";

let stripePromise = null;
async function getStripe() {
  if (!stripePromise) {
    const res = await base44.functions.invoke('stripePublishableKey', {});
    stripePromise = loadStripe(res.data?.publishable_key || res.data);
  }
  return stripePromise;
}

function PaymentForm({ clientSecret, orderNumber, onSuccess, amount }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);

  const handlePay = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (stripeError) { setError(stripeError.message); setPaying(false); return; }
    if (paymentIntent?.status === 'succeeded') {
      onSuccess();
    } else {
      setError('Payment did not complete. Please try again.');
      setPaying(false);
    }
  };

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <div className="p-4 rounded-xl border border-border bg-card/60">
        <PaymentElement />
      </div>
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
        </div>
      )}
      <Button type="submit" size="lg" className="w-full gradient-primary glow-sm" disabled={paying || !stripe}>
        {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : `Pay $${amount?.toFixed(2)} Now`}
      </Button>
      <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
        <Shield className="w-3 h-3" /> Secured by Stripe
      </p>
    </form>
  );
}

// Order summary panel — shows backend-returned pricing breakdown
function OrderSummary({ product, orderData, form, pkg }) {
  if (orderData) {
    // Use backend-authoritative values
    return (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Device ({form.quantity}x)</span>
          <div className="text-right">
            {orderData.fleet_partner_discount_applied ? (
              <div>
                <span className="text-white">${(orderData.sale_unit_price * form.quantity).toFixed(2)}</span>
                <span className="text-muted-foreground line-through ml-2 text-xs">${(orderData.msrp_unit_price * form.quantity).toFixed(2)}</span>
              </div>
            ) : (
              <span className="text-white">${(orderData.unit_price * form.quantity).toFixed(2)}</span>
            )}
          </div>
        </div>
        {orderData.fleet_partner_discount_applied && (
          <div className="flex justify-between text-green-400">
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{orderData.discount_label || 'Fleet Partner Discount'}</span>
            <span>−${orderData.total_discount_amount?.toFixed(2)}</span>
          </div>
        )}
        {orderData.monthly_subscription_price > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Subscription</span><span className="text-white">${orderData.monthly_subscription_price}/mo</span>
          </div>
        )}
        {orderData.shipping_amount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Shipping</span><span className="text-white">${orderData.shipping_amount?.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t border-border pt-2 flex justify-between font-semibold text-white">
          <span>Total Due</span><span>${orderData.total_amount?.toFixed(2)}</span>
        </div>
      </div>
    );
  }

  // Pre-submit estimate from product DB record
  if (product) {
    const isDiscount = product.is_discount_active && pkg === 'host_contactless_kit';
    const unitPrice = isDiscount ? product.sale_price : (product.device_price || 0);
    const subtotal = unitPrice * form.quantity;
    const shipping = product.shipping_price || 0;
    const total = subtotal + shipping;
    return (
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Device ({form.quantity}x)</span>
          <div className="text-right">
            {isDiscount ? (
              <div>
                <span className="text-white">${subtotal.toFixed(2)}</span>
                <span className="text-muted-foreground line-through ml-2 text-xs">${(product.msrp_price * form.quantity).toFixed(2)}</span>
              </div>
            ) : (
              <span className="text-white">${subtotal.toFixed(2)}</span>
            )}
          </div>
        </div>
        {isDiscount && (
          <div className="flex justify-between text-green-400">
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />{product.discount_label}</span>
            <span>−${(product.discount_amount * form.quantity).toFixed(2)}</span>
          </div>
        )}
        {product.monthly_subscription_price > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Subscription</span><span className="text-white">${product.monthly_subscription_price}/mo</span>
          </div>
        )}
        {shipping > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Shipping</span><span className="text-white">${shipping.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t border-border pt-2 flex justify-between font-semibold text-white">
          <span>Est. Total</span><span>${total.toFixed(2)}</span>
        </div>
      </div>
    );
  }

  return null;
}

export default function GPSCheckout() {
  const { user } = useAuth();
  const urlParams = new URLSearchParams(window.location.search);
  const defaultPkg = urlParams.get('pkg') || 'device_subscription';

  const [pkg, setPkg] = useState(defaultPkg);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', shipping_address: '', billing_address: '', vehicle_use_type: 'personal', quantity: 1 });
  const [sameBilling, setSameBilling] = useState(true);
  const [step, setStep] = useState('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [orderData, setOrderData] = useState(null);
  const [stripeInstance, setStripeInstance] = useState(null);
  // Fleet kit eligibility: null=loading, 'ELIGIBLE'=ok, or a denial reason string
  const [fleetEligibilityReason, setFleetEligibilityReason] = useState(null);

  const selectedProduct = products.find(p => p.package_type === pkg);
  const isFleetKit = pkg === 'host_contactless_kit';
  const fleetKitBlocked = isFleetKit && fleetEligibilityReason !== null && fleetEligibilityReason !== 'ELIGIBLE';

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    base44.entities.GPSProduct.filter({ is_active: true }, 'sort_order', 10)
      .then(setProducts).catch(() => {});
    getStripe().then(setStripeInstance);

    base44.auth.me().then(async u => {
      if (!u) { setFleetEligibilityReason('NOT_LOGGED_IN'); return; }
      if (u.email) set('email', u.email);
      if (u.full_name) set('name', u.full_name);
      // Check fleet eligibility
      const [byEmail, byUser] = await Promise.all([
        base44.entities.Host.filter({ email: u.email }),
        base44.entities.Host.filter({ user_id: u.id }),
      ]).catch(() => [[], []]);
      const host = byEmail[0] || byUser[0];
      if (!host) { setFleetEligibilityReason('NOT_HOST'); return; }
      if (host.status !== 'approved') { setFleetEligibilityReason('HOST_NOT_APPROVED'); return; }
      const [vehicles, devices] = await Promise.all([
        base44.entities.Vehicle.filter({ host_id: host.id, status: 'Available' }),
        base44.entities.TelematicsDevice.filter({ host_id: host.id, lifecycle_status: 'live_enabled' }),
      ]).catch(() => [[], []]);
      if (!vehicles.length) { setFleetEligibilityReason('NO_ACTIVE_VEHICLE'); return; }
      if (!devices.length) { setFleetEligibilityReason('NO_ACTIVE_TELEMATICS_DEVICE'); return; }
      setFleetEligibilityReason('ELIGIBLE');
    }).catch(() => setFleetEligibilityReason('NOT_LOGGED_IN'));
  }, []);

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (fleetKitBlocked) return;
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke('createGPSCheckoutPayment', {
      package_type: pkg,
      quantity: Number(form.quantity),
      customer_name: form.name,
      customer_email: form.email,
      customer_phone: form.phone,
      shipping_address: form.shipping_address,
      billing_address: sameBilling ? form.shipping_address : form.billing_address,
      vehicle_use_type: form.vehicle_use_type,
    });
    setLoading(false);
    if (res.data?.error) {
      setError(res.data.error);
      return;
    }
    setOrderData(res.data);
    setStep('payment');
  };

  const handlePaymentSuccess = () => setStep('success');

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <img src={LOGO} alt="Contactless360" className="h-10 mx-auto object-contain" />
          <h2 className="text-2xl font-syne font-bold text-white">Payment Confirmed!</h2>
          <p className="text-muted-foreground">Order <span className="text-white font-mono font-bold">{orderData?.order_number}</span> has been paid.</p>
          {orderData?.fleet_partner_discount_applied && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-300 text-sm flex items-center gap-2 justify-center">
              <Tag className="w-4 h-4" /> Fleet Partner Discount of ${orderData.total_discount_amount?.toFixed(2)} applied!
            </div>
          )}
          <p className="text-sm text-muted-foreground">Your device will ship within 1–2 business days. Activate it once delivered.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to={`/gps/activate?order=${orderData?.order_number}&email=${encodeURIComponent(form.email)}`}>
              <Button className="gradient-primary">Activate Device</Button>
            </Link>
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
            : <Link to="/account"><Button variant="ghost" size="sm">Sign In</Button></Link>
          }
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12 grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-3 space-y-6">
          <h1 className="text-2xl font-syne font-bold text-white">
            {step === 'payment' ? 'Secure Payment' : 'Complete Your Order'}
          </h1>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {/* Fleet Partner access gate */}
          {isFleetKit && fleetKitBlocked && (() => {
            const MESSAGES = {
              NOT_LOGGED_IN: 'Please log in as an approved Fleet Partner to access this pricing.',
              NOT_HOST: 'This kit is only for approved uRide Fleet Partners.',
              HOST_NOT_APPROVED: 'Your host account is still pending approval. Fleet Partner pricing is available once approved.',
              NO_ACTIVE_VEHICLE: 'You need at least one active vehicle in your fleet to use this expansion kit.',
              NO_ACTIVE_TELEMATICS_DEVICE: 'This looks like your first install. Please choose Contactless360 Device + Subscription instead.',
            };
            return (
              <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 space-y-3">
                <div className="flex items-center gap-2 text-yellow-400 font-semibold text-sm">
                  <Shield className="w-4 h-4" /> Fleet Partner Expansion Kit — Restricted
                </div>
                <p className="text-sm text-muted-foreground">{MESSAGES[fleetEligibilityReason] || 'Fleet Partner Kit pricing is available only to approved uRide Fleet Partners.'}</p>
                <div className="flex gap-3 flex-wrap">
                  <Link to="/gps/checkout?pkg=device_subscription">
                    <Button size="sm" className="gradient-primary">Buy First Device Setup</Button>
                  </Link>
                  {fleetEligibilityReason === 'NOT_LOGGED_IN'
                    ? <Link to="/account"><Button size="sm" variant="outline">Log In</Button></Link>
                    : <Link to="/become-a-host"><Button size="sm" variant="outline">Become a Fleet Partner</Button></Link>
                  }
                </div>
              </div>
            );
          })()}

          {step === 'form' && (
            <form onSubmit={handleOrderSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label>Package</Label>
                <Select value={pkg} onValueChange={setPkg}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="device_only">Device Only — $149</SelectItem>
                    <SelectItem value="device_subscription">Device + Subscription — $149 + $14.99/mo</SelectItem>
                    <SelectItem value="host_contactless_kit">Fleet Partner Kit — $130 + $14.99/mo (Approved Hosts Only)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2"><Label>Full Name *</Label><Input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Smith" /></div>
                <div className="space-y-1"><Label>Email *</Label><Input required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" /></div>
                <div className="space-y-1"><Label>Phone *</Label><Input required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" /></div>
              </div>
              <div className="space-y-1"><Label>Shipping Address *</Label><Input required value={form.shipping_address} onChange={e => set('shipping_address', e.target.value)} placeholder="123 Main St, City, State ZIP" /></div>
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
                    <SelectItem value="host_fleet">uRide Host Fleet</SelectItem>
                    <SelectItem value="dealer">Dealer / Finance</SelectItem>
                    <SelectItem value="rental">Rental Fleet</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Quantity</Label><Input type="number" min={1} max={20} value={form.quantity} onChange={e => set('quantity', Number(e.target.value))} /></div>
              <Button
                type="submit"
                size="lg"
                className="w-full gradient-primary glow-sm"
                disabled={loading || fleetKitBlocked || (isFleetKit && fleetEligibilityReason === null)}
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Order…</> :
                 fleetKitBlocked ? 'Fleet Partner Access Required' :
                 (isFleetKit && fleetEligibilityReason === null) ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> :
                 'Continue to Payment'}
              </Button>
            </form>
          )}

          {step === 'payment' && orderData?.client_secret && stripeInstance && (
            <Elements stripe={stripeInstance} options={{ clientSecret: orderData.client_secret, appearance: { theme: 'night' } }}>
              <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30 flex items-center gap-2 mb-4">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-300">Order <strong>{orderData.order_number}</strong> created. Complete payment to confirm.</span>
              </div>
              {orderData.fleet_partner_discount_applied && (
                <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center gap-2 mb-4">
                  <Tag className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-yellow-300">Fleet Partner Discount: −${orderData.total_discount_amount?.toFixed(2)} applied!</span>
                </div>
              )}
              <PaymentForm
                clientSecret={orderData.client_secret}
                orderNumber={orderData.order_number}
                amount={orderData.total_amount}
                onSuccess={handlePaymentSuccess}
              />
            </Elements>
          )}
        </div>

        {/* ORDER SUMMARY */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-4">
            <img src={PRODUCT_IMG} alt="Contactless360" className="w-full rounded-xl object-cover" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-syne font-bold text-white">
                  {selectedProduct?.name || pkg.replace(/_/g, ' ')}
                </h3>
                {isFleetKit && selectedProduct?.is_discount_active && (
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">Fleet Partner Exclusive</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">{selectedProduct?.description || ''}</p>
            </div>
            <OrderSummary product={selectedProduct} orderData={orderData} form={form} pkg={pkg} />
          </div>
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-4 space-y-2">
            {["12-Month Warranty", "Plug & Play Installation", "24/7 GPS Monitoring", "4G LTE Connectivity"].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm text-green-300">
                <CheckCircle className="w-3.5 h-3.5" /> {f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}