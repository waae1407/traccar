import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Zap, ArrowLeft, AlertCircle } from 'lucide-react';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

export default function GPSActivate() {
  const urlParams = new URLSearchParams(window.location.search);
  const [form, setForm] = useState({
    order_number: urlParams.get('order') || '',
    email: '',
    imei: '',
    vin: '',
    year: '',
    make: '',
    model: '',
    plate: '',
    use_type: 'personal',
    sim_provider: '',
    installation_status: 'self_installed',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [hostVehicles, setHostVehicles] = useState([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [user, setUser] = useState(null);
  const [myHost, setMyHost] = useState(null);
  const [step, setStep] = useState(1);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

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
      const orders = await base44.entities.GPSOrder.filter({ order_number: form.order_number, customer_email: form.email });
      if (!orders.length) { setError('Order not found. Please check your order number and email.'); setLoading(false); return; }
      setStep(2);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleActivate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const orders = await base44.entities.GPSOrder.filter({ order_number: form.order_number });
      const order = orders[0];

      // Create TelematicsDevice record
      const deviceData = {
        device_unique_id: form.imei,
        imei: form.imei,
        provider_key: 'contactless360',
        online_status: 'offline',
        activation_status: 'activated',
        subscription_status: 'active',
        supports_starter_interrupt: true,
        supports_contactless: true,
        sim_provider: form.sim_provider,
      };

      if (myHost && selectedVehicleId) {
        deviceData.host_id = myHost.id;
        deviceData.vehicle_id = selectedVehicleId;
        // Update vehicle with device reference
        await base44.entities.Vehicle.update(selectedVehicleId, { telematics_provider: 'other' });
      }

      const device = await base44.entities.TelematicsDevice.create(deviceData).catch(() => null);

      // Update order
      if (order) {
        await base44.entities.GPSOrder.update(order.id, {
          activation_status: 'activated',
          order_status: 'active',
          device_ids: [form.imei],
        });
      }

      setSuccess(true);
    } catch (e) { setError(e.message); }
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
        <Link to="/gps">
          <img src={LOGO} alt="Contactless360" className="h-8 object-contain" />
        </Link>
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
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
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
              {loading ? 'Looking up…' : 'Verify Order'}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              No order yet? <Link to="/gps/checkout" className="text-yellow-400 hover:underline">Buy a device first</Link>
            </p>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={handleActivate} className="space-y-5 glass rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-400">Order verified</span>
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
              {loading ? 'Activating…' : 'Activate Device'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}