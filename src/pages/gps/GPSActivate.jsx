import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Zap, ArrowLeft, AlertCircle, Loader2, CreditCard } from 'lucide-react';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

export default function GPSActivate() {
  const urlParams = new URLSearchParams(window.location.search);
  const navigate = useNavigate();
  const [form, setForm] = useState({
    order_number: urlParams.get('order') || '',
    email: urlParams.get('email') || '',
    imei: '',
    year: '', make: '', model: '', vin: '', plate: '',
    use_type: 'personal',
    sim_provider: '',
    installation_status: 'self_installed',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState(null);
  const [hostVehicles, setHostVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [user, setUser] = useState(null);
  const [myHost, setMyHost] = useState(null);
  const [step, setStep] = useState(1);
  const [activatedDevice, setActivatedDevice] = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Auto-fill email for authenticated users
  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      if (u?.email && !form.email) set('email', u.email);
    }).catch(() => {});
  }, []);

  const lookupOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      if (u) {
        const hosts = await base44.entities.Host.filter({ email: u.email });
        const hostByUser = await base44.entities.Host.filter({ user_id: u.id });
        const host = hosts[0] || hostByUser[0];
        if (host) {
          setMyHost(host);
          const vehicles = await base44.entities.Vehicle.filter({ host_id: host.id });
          setHostVehicles(vehicles);
        }
      }

      const orders = await base44.entities.GPSOrder.filter({ order_number: form.order_number });
      if (!orders.length) {
        setError('Order not found. Please check your order number.');
        setLoading(false);
        return;
      }

      const foundOrder = orders[0];

      // Validate email match
      if (foundOrder.customer_email?.toLowerCase().trim() !== form.email.toLowerCase().trim()) {
        setError('Email does not match the order on file.');
        setLoading(false);
        return;
      }

      // BLOCKER 3: Require paid order
      if (foundOrder.payment_status !== 'paid') {
        setError('Payment has not been confirmed. Please complete payment before activating this device.');
        // Log blocked activation attempt
        base44.entities.ActivityEvent.create({
          event_type: 'gps.command_failed',
          actor_id: u?.id || 'guest',
          actor_email: form.email,
          actor_role: 'customer',
          target_entity: 'GPSOrder',
          target_id: foundOrder.id,
          summary: `GPS activation blocked — payment not confirmed for order ${form.order_number}`,
          metadata: { order_number: form.order_number, payment_status: foundOrder.payment_status },
          source: 'customer_app',
          event_status: 'warning',
        }).catch(() => {});
        setLoading(false);
        return;
      }

      // BLOCKER 5: Check if already fully activated
      const deviceIds = foundOrder.device_ids || [];
      const qty = foundOrder.quantity || 1;
      if (deviceIds.length >= qty) {
        setError(`This order has already been fully activated (${qty} of ${qty} devices).`);
        setLoading(false);
        return;
      }

      if (['cancelled', 'refunded'].includes(foundOrder.order_status)) {
        setError('This order is no longer active and cannot be used for activation.');
        setLoading(false);
        return;
      }

      setOrder(foundOrder);
      setStep(2);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // BLOCKER 4: Check for duplicate IMEI (check both unique_id and imei fields)
      const existingByUid = await base44.entities.TelematicsDevice.filter({ unique_id: form.imei });
      const existingByImei = existingByUid.length === 0 ? await base44.entities.TelematicsDevice.filter({ imei: form.imei }) : existingByUid;
      if (existingByImei.length > 0) {
        setError('This device is already activated. Each IMEI can only be registered once.');
        setLoading(false);
        return;
      }

      // BLOCKER 5: Re-validate quantity limit before creating
      const freshOrders = await base44.entities.GPSOrder.filter({ order_number: form.order_number });
      const freshOrder = freshOrders[0];
      const currentDeviceIds = freshOrder?.device_ids || [];
      const qty = freshOrder?.quantity || 1;
      if (currentDeviceIds.length >= qty) {
        setError(`Activation limit reached. This order allows ${qty} device(s) and all have been activated.`);
        setLoading(false);
        return;
      }

      // Build device record — unique_id is the required primary key (IMEI for contactless360)
      const deviceData = {
        unique_id: form.imei,
        device_unique_id: form.imei,
        imei: form.imei,
        provider_key: 'contactless360',
        provider_type: 'contactless360',
        online_status: 'offline',
        activation_status: 'activated',
        subscription_status: 'active',
        supports_starter_interrupt: true,
        supports_contactless: true,
        sim_provider: form.sim_provider || '',
        installation_type: form.installation_status,
        lifecycle_status: 'provisioned',
        assigned_status: 'unassigned',
      };

      if (myHost && selectedVehicleId) {
        deviceData.host_id = myHost.id;
        deviceData.vehicle_id = selectedVehicleId;
        await base44.entities.Vehicle.update(selectedVehicleId, { telematics_provider: 'other', telematics_device_id: form.imei });
      } else if (!myHost && form.vin) {
        deviceData.vin = form.vin;
      }

      const device = await base44.entities.TelematicsDevice.create(deviceData);
      setActivatedDevice(device);

      // Update order device_ids + activation_status
      const newDeviceIds = [...currentDeviceIds, device.id];
      const newActivationStatus = newDeviceIds.length >= qty ? 'activated' : 'partially_activated';
      await base44.entities.GPSOrder.update(freshOrder.id, {
        device_ids: newDeviceIds,
        activation_status: newActivationStatus,
        order_status: newActivationStatus === 'activated' ? 'active' : 'activation_pending',
      });

      // Audit log
      await base44.entities.ActivityEvent.create({
        event_type: 'gps.device_online',
        actor_id: user?.id || 'guest',
        actor_email: form.email,
        actor_role: myHost ? 'host' : 'customer',
        target_entity: 'TelematicsDevice',
        target_id: device.id,
        host_id: myHost?.id || '',
        summary: `GPS device activated: IMEI ${form.imei} for order ${form.order_number}`,
        metadata: { imei: form.imei, order_id: freshOrder.id, vehicle_id: selectedVehicleId || '', device_id: device.id },
        source: myHost ? 'host_portal' : 'customer_app',
        event_status: 'success',
      }).catch(() => {});

      // Notify
      await base44.integrations.Core.SendEmail({
        to: form.email,
        subject: '✅ Your Contactless360 GPS Device is Activated',
        body: `Your GPS device (IMEI: ${form.imei}) has been successfully activated for order ${form.order_number}. It may take up to 10 minutes to appear online.`,
      }).catch(() => {});

      // BLOCKER 6: Create subscription if needed
      if (freshOrder.package_type !== 'device_only') {
        // Resolve monthly price from order unit_price chain or fallback
        const monthlyPrice = freshOrder.monthly_subscription_price || 14.99;
        const subRes = await base44.functions.invoke('createGPSSubscription', {
          order_id: freshOrder.id,
          device_id: device.id,
          monthly_price: monthlyPrice,
          plan_name: freshOrder.package_type === 'host_contactless_kit' ? 'Contactless360 Host Kit Monthly' : 'Contactless360 GPS Monthly',
          stripe_customer_id: freshOrder.stripe_customer_id || '',
        }).catch(err => ({ data: { error: err.message, subscription_failed: true } }));

        if (subRes?.data?.subscription_failed) {
          // Mark activation incomplete
          await base44.entities.GPSOrder.update(freshOrder.id, { activation_status: 'subscription_failed' });
          setError('Subscription setup failed. Your device was registered but monitoring service could not be activated. Please contact support.');
          setLoading(false);
          return;
        }
      }

      setSuccess(true);
    } catch (e) {
      setError(e.message);
      // Audit blocked/failed activation
      await base44.entities.ActivityEvent.create({
        event_type: 'gps.command_failed',
        actor_id: user?.id || 'guest',
        actor_email: form.email,
        actor_role: myHost ? 'host' : 'customer',
        target_entity: 'GPSOrder',
        summary: `GPS activation failed for order ${form.order_number}: ${e.message}`,
        metadata: { imei: form.imei, error: e.message },
        source: 'customer_app',
        event_status: 'error',
      }).catch(() => {});
    }
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
          <h2 className="text-2xl font-syne font-bold text-white">Device Activated!</h2>
          <p className="text-muted-foreground">Your Contactless360 GPS device has been registered and is initializing. It may take up to 10 minutes to appear online.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            {myHost ? (
              <Link to="/host/telematics"><Button className="gradient-primary">View in Host Portal</Button></Link>
            ) : (
              <Link to="/customer/gps"><Button className="gradient-primary">My GPS Devices</Button></Link>
            )}
            <Link to="/gps"><Button variant="outline">Back to GPS Store</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border">
        <Link to="/gps"><img src={LOGO} alt="Contactless360" className="h-8 object-contain" /></Link>
        <Link to="/gps" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>
      </nav>

      <div className="max-w-xl mx-auto px-6 py-12 space-y-8">
        <div className="text-center space-y-2">
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Device Activation</Badge>
          <h1 className="text-3xl font-syne font-bold text-white">Activate Your Device</h1>
          <p className="text-muted-foreground">Register your Contactless360 GPS and assign it to a vehicle.</p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              {error}
              {error.includes('complete payment') && (
                <div className="mt-2">
                  <Link to="/gps/checkout"><Button size="sm" className="gradient-primary"><CreditCard className="w-3 h-3" /> Complete Payment</Button></Link>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 glass rounded-2xl p-6">
            <h2 className="font-semibold text-white">Step 1: Verify Your Order</h2>
            <div className="space-y-1">
              <Label>Order Number *</Label>
              <Input value={form.order_number} onChange={e => set('order_number', e.target.value)} placeholder="C360-XXXXXX" />
            </div>
            <div className="space-y-1">
              <Label>Email Address *</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="your@email.com" />
            </div>
            <Button onClick={lookupOrder} className="w-full gradient-primary" disabled={loading || !form.order_number || !form.email}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify Order'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              No order yet? <Link to="/gps/checkout" className="text-yellow-400 hover:underline">Buy a device first</Link>
            </p>
          </div>
        )}

        {step === 2 && order && (
          <form onSubmit={handleActivate} className="space-y-5 glass rounded-2xl p-6">
            <div className="flex items-center gap-2 p-3 rounded-xl bg-green-500/10 border border-green-500/30">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              <div className="text-sm text-green-300">
                Order <strong>{order.order_number}</strong> verified — {order.device_ids?.length || 0}/{order.quantity} device(s) activated
              </div>
            </div>

            <h2 className="font-semibold text-white">Step 2: Device & Vehicle Info</h2>

            <div className="space-y-1">
              <Label>Device IMEI / Serial Number *</Label>
              <Input required value={form.imei} onChange={e => set('imei', e.target.value)} placeholder="15-digit IMEI" />
              <p className="text-xs text-muted-foreground">Found on device label or box</p>
            </div>

            <div className="space-y-1">
              <Label>Vehicle Use Type</Label>
              <Select value={form.use_type} onValueChange={v => set('use_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal Vehicle</SelectItem>
                  <SelectItem value="host_fleet">Host Fleet Vehicle</SelectItem>
                  <SelectItem value="dealer">Dealer Vehicle</SelectItem>
                  <SelectItem value="rental">Rental</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {myHost && hostVehicles.length > 0 && (
              <div className="space-y-1">
                <Label>Assign to Host Vehicle (optional)</Label>
                <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                  <SelectTrigger><SelectValue placeholder="Select a vehicle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>No vehicle yet</SelectItem>
                    {hostVehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model} — {v.plate || v.vin || 'No plate'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(!myHost || !selectedVehicleId) && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1"><Label>Year</Label><Input value={form.year} onChange={e => set('year', e.target.value)} placeholder="2022" /></div>
                  <div className="space-y-1"><Label>Make</Label><Input value={form.make} onChange={e => set('make', e.target.value)} placeholder="Toyota" /></div>
                  <div className="space-y-1"><Label>Model</Label><Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="Camry" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>VIN</Label><Input value={form.vin} onChange={e => set('vin', e.target.value)} placeholder="17-char VIN" /></div>
                  <div className="space-y-1"><Label>Plate (optional)</Label><Input value={form.plate} onChange={e => set('plate', e.target.value)} placeholder="ABC-1234" /></div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label>SIM Provider (if known)</Label>
              <Input value={form.sim_provider} onChange={e => set('sim_provider', e.target.value)} placeholder="e.g. T-Mobile, AT&T, Global" />
            </div>

            <div className="space-y-1">
              <Label>Installation Status</Label>
              <Select value={form.installation_status} onValueChange={v => set('installation_status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="self_installed">Self Installed</SelectItem>
                  <SelectItem value="professional_installed">Professional Installed</SelectItem>
                  <SelectItem value="not_yet_installed">Not Yet Installed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" size="lg" className="w-full gradient-primary glow-sm" disabled={loading || !form.imei}>
              <Zap className="w-4 h-4" />
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Activating…</> : 'Activate Device'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}