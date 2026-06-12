import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Package, ArrowLeft, Shield } from 'lucide-react';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";
const PRODUCT_IMG = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/4f05d3221_29FB89C9-50E3-48A5-A76D-C33D086036D1.png";

const PACKAGES = {
  device_only: { label: "Device Only", price: 149, sub: 0, activation: 0, shipping: 9.99, desc: "Hardware only. Activate anytime on uRideHub." },
  device_subscription: { label: "Device + Subscription", price: 149, sub: 14.99, activation: 0, shipping: 0, desc: "Full tracking service included." },
  host_contactless_kit: { label: "Host Contactless Kit", price: 179, sub: 14.99, activation: 0, shipping: 0, desc: "GPS + full contactless rental setup." },
};

export default function GPSCheckout() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const defaultPkg = urlParams.get('pkg') || 'device_subscription';

  const [pkg, setPkg] = useState(defaultPkg);
  const [form, setForm] = useState({
    name: '', email: '', phone: '',
    shipping_address: '', billing_address: '',
    vehicle_use_type: 'personal', quantity: 1,
  });
  const [sameBilling, setSameBilling] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

  const selected = PACKAGES[pkg] || PACKAGES.device_subscription;
  const subtotal = selected.price * form.quantity;
  const shipping = selected.shipping;
  const total = subtotal + shipping;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const orderNum = `C360-${Date.now().toString(36).toUpperCase()}`;
    const order = await base44.entities.GPSOrder.create({
      order_number: orderNum,
      customer_name: form.name,
      customer_email: form.email,
      customer_phone: form.phone,
      shipping_address: form.shipping_address,
      billing_address: sameBilling ? form.shipping_address : form.billing_address,
      package_type: pkg,
      quantity: Number(form.quantity),
      unit_price: selected.price,
      subtotal,
      tax_amount: 0,
      shipping_amount: shipping,
      total_amount: total,
      vehicle_use_type: form.vehicle_use_type,
      payment_status: 'pending_payment',
      order_status: 'pending_payment',
      activation_status: 'not_started',
    });
    setSuccess({ order_number: orderNum, order_id: order.id });
    setLoading(false);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle className="w-10 h-10 text-green-400" />
          </div>
          <img src={LOGO} alt="Contactless360" className="h-10 mx-auto object-contain" />
          <h2 className="text-2xl font-syne font-bold text-white">Order Placed!</h2>
          <p className="text-muted-foreground">Order <span className="text-white font-mono font-bold">{success.order_number}</span> has been created.</p>
          <p className="text-sm text-muted-foreground">Our team will process your order and send a confirmation email with shipping details.</p>
          <div className="flex gap-3 justify-center">
            <Link to={`/gps/activate?order=${success.order_number}`}>
              <Button className="gradient-primary">Activate Device</Button>
            </Link>
            <Link to="/gps">
              <Button variant="outline">Back to GPS</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <Link to="/gps">
          <img src={LOGO} alt="Contactless360" className="h-8 object-contain" />
        </Link>
        <Link to="/gps" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-12 grid lg:grid-cols-5 gap-10">
        {/* ORDER FORM */}
        <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-6">
          <h1 className="text-2xl font-syne font-bold text-white">Complete Your Order</h1>

          {/* Package selector */}
          <div className="space-y-2">
            <Label>Package</Label>
            <Select value={pkg} onValueChange={setPkg}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="device_only">Device Only — $149</SelectItem>
                <SelectItem value="device_subscription">Device + Subscription — $149 + $14.99/mo</SelectItem>
                <SelectItem value="host_contactless_kit">Host Contactless Kit — $179 + $14.99/mo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <Label>Full Name *</Label>
              <Input required value={form.name} onChange={e => set('name', e.target.value)} placeholder="John Smith" />
            </div>
            <div className="space-y-1">
              <Label>Email *</Label>
              <Input required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
            </div>
            <div className="space-y-1">
              <Label>Phone *</Label>
              <Input required value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Shipping Address *</Label>
            <Input required value={form.shipping_address} onChange={e => set('shipping_address', e.target.value)} placeholder="123 Main St, City, State ZIP" />
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="sameBilling" checked={sameBilling} onChange={e => setSameBilling(e.target.checked)} className="rounded" />
            <label htmlFor="sameBilling" className="text-sm text-muted-foreground">Billing address same as shipping</label>
          </div>

          {!sameBilling && (
            <div className="space-y-1">
              <Label>Billing Address *</Label>
              <Input required value={form.billing_address} onChange={e => set('billing_address', e.target.value)} placeholder="123 Main St, City, State ZIP" />
            </div>
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

          <div className="space-y-1">
            <Label>Quantity</Label>
            <Input type="number" min={1} max={20} value={form.quantity} onChange={e => set('quantity', e.target.value)} />
          </div>

          <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-start gap-3">
            <Shield className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-200">Your payment is processed securely. After placing this order, our team will reach out within 1 business day to finalize payment and shipping.</p>
          </div>

          <Button type="submit" size="lg" className="w-full gradient-primary glow-sm" disabled={loading}>
            {loading ? 'Placing Order…' : `Place Order — $${total.toFixed(2)}`}
          </Button>
        </form>

        {/* ORDER SUMMARY */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-2xl border border-border bg-card/60 p-6 space-y-4">
            <img src={PRODUCT_IMG} alt="Contactless360" className="w-full rounded-xl object-cover" />
            <div>
              <h3 className="font-syne font-bold text-white">{selected.label}</h3>
              <p className="text-sm text-muted-foreground mt-1">{selected.desc}</p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Device ({form.quantity}x)</span>
                <span className="text-white">${(selected.price * form.quantity).toFixed(2)}</span>
              </div>
              {selected.sub > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Subscription</span>
                  <span className="text-white">${selected.sub}/mo</span>
                </div>
              )}
              {shipping > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping</span>
                  <span className="text-white">${shipping.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex justify-between font-semibold text-white">
                <span>Total Due</span>
                <span>${total.toFixed(2)}</span>
              </div>
            </div>
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