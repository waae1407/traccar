import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from "@/lib/AuthContext";
import AccountMenu from "@/components/shared/AccountMenu";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Zap, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react';
import ActivationPaymentSheet from '@/components/gps/ActivationPaymentSheet';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

export default function GPSActivate() {
  const { user: authUser } = useAuth();
  const [imei, setImei] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [device, setDevice] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleActivate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const imeiClean = imei.trim();
    if (!/^\d{15}$/.test(imeiClean)) {
      setError('IMEI must be exactly 15 digits.');
      setLoading(false);
      return;
    }

    try {
      // Find device by IMEI (unique_id)
      const devices = await base44.entities.TelematicsDevice.filter({ unique_id: imeiClean });
      if (!devices.length) {
        setError('Device not found. Check the 15-digit IMEI on your device label.');
        setLoading(false);
        return;
      }

      const found = devices[0];

      // Already activated with active subscription
      if (found.subscription_status === 'active' || found.subscription_status === 'trialing') {
        setError('This device is already activated.');
        setLoading(false);
        return;
      }

      setDevice(found);
      setShowPayment(true);
    } catch (err) {
      setError(err.message);
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
          <h2 className="text-2xl font-syne font-bold text-white">Activated!</h2>
          <p className="text-muted-foreground">Your GPS is live. It may take up to 10 minutes to appear online.</p>
          <Link to="/customer/gps"><Button className="gradient-primary">Go to My GPS</Button></Link>
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
          {authUser
            ? <AccountMenu role={authUser.role === "admin" ? "admin" : authUser.role === "host" ? "host" : "user"} accountPath="/customer/gps" compact />
            : <Link to="/account"><Button variant="ghost" size="sm">Sign In</Button></Link>
          }
        </div>
      </nav>

      <div className="max-w-md mx-auto px-6 py-16 space-y-8">
        <div className="text-center space-y-2">
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Activate</Badge>
          <h1 className="text-3xl font-syne font-bold text-white">Enter Your IMEI</h1>
          <p className="text-muted-foreground text-sm">15 digits on your device label. $14.99/mo after 7-day free trial.</p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleActivate} className="space-y-4 glass rounded-2xl p-6">
          <Input
            value={imei}
            onChange={e => setImei(e.target.value.replace(/\D/g, '').slice(0, 15))}
            placeholder="15-digit IMEI"
            inputMode="numeric"
            className="text-center text-lg font-mono tracking-wider"
          />
          <Button type="submit" className="w-full gradient-primary glow-sm" disabled={loading || imei.length !== 15}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</> : <><Zap className="w-4 h-4" /> Activate</>}
          </Button>
        </form>

        <p className="text-xs text-center text-muted-foreground">
          Don't have a device? <Link to="/gps" className="text-yellow-400 hover:underline">Buy one</Link>
        </p>
      </div>

      {showPayment && device && (
        <ActivationPaymentSheet
          deviceId={device.id}
          onClose={() => setShowPayment(false)}
          onSuccess={() => { setShowPayment(false); setSuccess(true); }}
        />
      )}
    </div>
  );
}