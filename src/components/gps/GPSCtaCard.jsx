import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, Package, Zap, MapPin, Lock, Bell } from 'lucide-react';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

/**
 * GPS CTA card for Vehicle360 Telematics tab when no device is assigned.
 */
export default function GPSCtaCard({ vehicleId }) {
  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/8 to-yellow-600/4 p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/20 flex items-center justify-center">
          <Shield className="w-5 h-5 text-yellow-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-yellow-300">No GPS Device Installed</p>
          <p className="text-xs text-muted-foreground">This vehicle has no telematics protection</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-white font-medium">Enable Contactless360 to unlock:</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { Icon: MapPin, text: "Live Tracking" },
            { Icon: Lock, text: "Contactless Rentals" },
            { Icon: Shield, text: "Theft Recovery" },
            { Icon: Bell, text: "Remote Commands" },
          ].map(({ Icon, text }) => (
            <div key={text} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Icon className="w-3.5 h-3.5 text-yellow-400" /> {text}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Link to={`/host/gps-store?vehicle=${vehicleId}`}>
          <Button size="sm" className="gradient-primary">
            <Package className="w-3.5 h-3.5" /> Order GPS Device
          </Button>
        </Link>
        <Link to={`/gps/activate`}>
          <Button size="sm" variant="outline">
            <Zap className="w-3.5 h-3.5" /> I Already Have a Device
          </Button>
        </Link>
      </div>

      <img src={LOGO} alt="Contactless360" className="h-5 object-contain opacity-60" />
    </div>
  );
}