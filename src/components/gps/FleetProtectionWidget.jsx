import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Shield, Package, Zap, AlertCircle } from 'lucide-react';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

export default function FleetProtectionWidget({ hostId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (!hostId) return;
    loadStats();
  }, [hostId]);

  const loadStats = async () => {
    const [vehicles, devices] = await Promise.all([
      base44.entities.Vehicle.filter({ host_id: hostId }),
      base44.entities.TelematicsDevice.filter({ host_id: hostId }),
    ]);
    const protected_ = vehicles.filter(v =>
      v.telematics_device_id || v.moovetrax_device_id || devices.some(d => d.vehicle_id === v.id)
    ).length;
    const contactless = vehicles.filter(v => v.contactless_pickup).length;
    setStats({
      total: vehicles.length,
      protected: protected_,
      unprotected: vehicles.length - protected_,
      contactless,
    });
  };

  if (!stats) return null;

  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={LOGO} alt="Contactless360" className="h-6 object-contain" />
          <span className="text-sm font-semibold text-white">Fleet Protection</span>
        </div>
        {stats.unprotected > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="w-3.5 h-3.5" />
            {stats.unprotected} unprotected
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-2xl font-black text-white">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total</p>
        </div>
        <div>
          <p className="text-2xl font-black text-green-400">{stats.protected}</p>
          <p className="text-xs text-muted-foreground">Protected</p>
        </div>
        <div>
          <p className="text-2xl font-black text-yellow-400">{stats.contactless}</p>
          <p className="text-xs text-muted-foreground">Contactless</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Fleet coverage</span>
          <span>{stats.total > 0 ? Math.round((stats.protected / stats.total) * 100) : 0}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 to-green-500 rounded-full transition-all duration-500"
            style={{ width: `${stats.total > 0 ? (stats.protected / stats.total) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Link to="/host/gps-store" className="flex-1">
          <Button size="sm" className="w-full gradient-primary text-xs">
            <Package className="w-3.5 h-3.5" /> Order Devices
          </Button>
        </Link>
        <Link to="/gps/activate" className="flex-1">
          <Button size="sm" variant="outline" className="w-full text-xs">
            <Zap className="w-3.5 h-3.5" /> Activate
          </Button>
        </Link>
      </div>
    </div>
  );
}