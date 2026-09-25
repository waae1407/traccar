import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { MapPin, Shield, Zap, Package, AlertCircle, CheckCircle, RefreshCw, Satellite, Battery, Signal, Power, Settings, Wrench } from 'lucide-react';
import GPSControlPanel from '@/components/gps/GPSControlPanel';
import GPSScheduleManager from '@/components/gps/GPSScheduleManager';
import GeofenceConfig from '@/components/gps/GeofenceConfig';
import EmergencyContactsManager from '@/components/gps/EmergencyContactsManager';
import StartRentingButton from '@/components/gps/StartRentingButton';
import SubscriptionPastDueBanner from '@/components/gps/SubscriptionPastDueBanner';
import TrialActivationBanner from '@/components/gps/TrialActivationBanner';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

export default function CustomerGPS() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [activeDevice, setActiveDevice] = useState(null);
  const [activeSubscription, setActiveSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const u = await base44.auth.me();
      setUser(u);
      const [ords, subs, devs] = await Promise.all([
        base44.entities.GPSOrder.filter({ customer_email: u.email }, '-created_date', 20),
        base44.entities.GPSSubscription.filter({ customer_user_id: u.id }, '-created_date', 20),
        base44.entities.TelematicsDevice.filter({ owner_user_id: u.id, device_mode: 'personal' }, '-created_date', 20),
      ]);
      setOrders(ords);
      setSubscriptions(subs);
      setDevices(devs);
      // Pick the first active device + its subscription
      const firstDevice = devs?.[0];
      setActiveDevice(firstDevice);
      if (firstDevice && subs.length > 0) {
        const linkedSub = subs.find(s => s.device_id === firstDevice.id) || subs[0];
        setActiveSubscription(linkedSub);
      }
    } catch (e) {
      base44.auth.redirectToLogin('/customer/gps');
      return;
    }
    setLoading(false);
  };

  const statusColor = (s) => {
    if (s === 'active' || s === 'activated') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (s === 'shipped') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    if (s === 'paid') return 'bg-green-500/20 text-green-400 border-green-500/30';
    if (s === 'pending_payment' || s === 'processing') return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    if (s === 'past_due' || s === 'failed' || s === 'control_disabled' || s === 'deactivated') return 'bg-red-500/20 text-red-400 border-red-500/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  const getBatteryInfo = (device) => {
    const voltage = device?.power_voltage || device?.battery_voltage || 0;
    if (!voltage) return { label: "Unknown", color: "#71717A" };
    if (voltage < 11.8) return { label: "Critical", color: "#FF453A" };
    if (voltage <= 12.1) return { label: "Low", color: "#FF9F0A" };
    if (device?.ignition_status === 'on' || voltage >= 13.0) return { label: "Charging", color: "#30D158" };
    return { label: "Good", color: "#30D158" };
  };

  const freshness = (device) => {
    const value = device?.last_seen_at || device?.location_updated_at;
    if (!value) return { label: "No GPS", status: "offline" };
    const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
    if (minutes < 2) return { label: "Live", status: "online" };
    if (minutes < 30) return { label: `${minutes}m ago`, status: "online" };
    return { label: "Stale", status: "offline" };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin" /> Loading GPS portal…
        </div>
      </div>
    );
  }

  if (!user) return null;

  const battInfo = getBatteryInfo(activeDevice);
  const gps = freshness(activeDevice);

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <img src={LOGO} alt="Contactless360" className="h-8 object-contain" />
            <div>
              <h1 className="text-xl font-syne font-bold text-white">My GPS Devices</h1>
              <p className="text-sm text-muted-foreground">Protect and control your vehicle</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/gps/activate"><button className="flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5"><Zap className="w-3.5 h-3.5" /> Activate</button></Link>
            <Link to="/gps/checkout"><button className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}><Package className="w-3.5 h-3.5" /> Buy Device</button></Link>
          </div>
        </div>

        {/* ── DEVICE + CONTROL PANEL (if device exists) ── */}
        {activeDevice ? (
          <>
            {/* Device Status Card */}
            <div className="glass rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <Satellite size={20} color={gps.status === "online" ? "#30D158" : "#71717A"} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Device {activeDevice.unique_id || activeDevice.imei || "—"}</p>
                    <p className="text-xs text-white/40">{activeDevice.model || "Contactless360 GPS Tracker"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Battery */}
                  <div className="flex items-center gap-1.5">
                    <Battery size={14} color={battInfo.color} />
                    <span className="text-xs font-medium" style={{ color: battInfo.color }}>{battInfo.label}</span>
                  </div>
                  {/* GPS Freshness */}
                  <div className="flex items-center gap-1.5">
                    <MapPin size={14} color={gps.status === "online" ? "#30D158" : "#71717A"} />
                    <span className="text-xs font-medium text-white/60">{gps.label}</span>
                  </div>
                  {/* Signal */}
                  <div className="flex items-center gap-1.5">
                    <Signal size={14} color="#71717A" />
                    <span className="text-xs text-white/40">{activeDevice.signal_strength ? `${activeDevice.signal_strength}%` : "—"}</span>
                  </div>
                </div>
              </div>

              {/* Location preview */}
              {activeDevice.last_latitude && activeDevice.last_longitude && (
                <a
                  href={`https://www.google.com/maps?q=${activeDevice.last_latitude},${activeDevice.last_longitude}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-xs text-white/60 hover:bg-white/5"
                >
                  <MapPin size={14} color="#2F80FF" />
                  <span>View on Google Maps</span>
                  {activeDevice.address && <span className="text-white/30">· {activeDevice.address}</span>}
                </a>
              )}
            </div>

            {/* Installation Status Card */}
            {activeDevice.install_status && activeDevice.install_status !== 'not_started' && (
              <div className="glass rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Wrench size={16} color="#E91E8C" />
                  <h2 className="text-sm font-bold text-white">Installation Status</h2>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {activeDevice.install_status === 'installed' ? (
                      <CheckCircle className="w-5 h-5 text-green-400" />
                    ) : activeDevice.install_status === 'correction_needed' || activeDevice.install_status === 'failed' ? (
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    ) : (
                      <Wrench className="w-5 h-5 text-yellow-400" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-white capitalize">
                        {activeDevice.install_status?.replace(/_/g, ' ')}
                      </p>
                      {activeDevice.installation_completed_at && (
                        <p className="text-xs text-white/40">
                          Completed {new Date(activeDevice.installation_completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/40">Type</p>
                    <p className="text-sm text-white/70 capitalize">
                      {activeDevice.installation_type?.replace(/_/g, ' ') || 'Not specified'}
                    </p>
                  </div>
                </div>
                {activeDevice.install_status === 'correction_needed' && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Installation needs attention. Contact your installer or support.</span>
                  </div>
                )}
              </div>
            )}

            {/* Trial Activation Banner */}
            <TrialActivationBanner
              device={activeDevice}
              subscription={activeSubscription}
              onActivated={loadData}
            />

            {/* Past Due Banner */}
            <SubscriptionPastDueBanner
              subscription={activeSubscription}
              onUpdatePayment={() => navigate('/account')}
            />

            {/* ── REMOTE CONTROL PANEL (7 buttons) ── */}
            <div className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Power size={16} color="#E91E8C" />
                  <h2 className="text-sm font-bold text-white">Remote Controls</h2>
                </div>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:bg-white/10"
                >
                  <Settings size={14} /> {showSettings ? "Hide" : "Settings"}
                </button>
              </div>
              <GPSControlPanel
                device={activeDevice}
                subscription={activeSubscription}
                onRefresh={loadData}
              />
            </div>

            {/* ── SETTINGS: Schedules, Geofence, Emergency Contacts ── */}
            {showSettings && (
              <div className="space-y-4">
                <div className="glass rounded-2xl p-5">
                  <GPSScheduleManager device={activeDevice} user={user} />
                </div>
                <div className="glass rounded-2xl p-5">
                  <GeofenceConfig device={activeDevice} user={user} />
                </div>
                <div className="glass rounded-2xl p-5">
                  <EmergencyContactsManager user={user} />
                </div>
              </div>
            )}

            {/* ── START RENTING UPSELL ── */}
            <StartRentingButton device={activeDevice} user={user} />
          </>
        ) : (
          /* No device — show orders + CTA */
          <>
            {/* ORDERS */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Your Orders</h2>
              {orders.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center space-y-4">
                  <Shield className="w-12 h-12 text-yellow-400 mx-auto" />
                  <p className="text-muted-foreground">No GPS orders yet.</p>
                  <Link to="/gps/checkout"><button className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>Order a Device</button></Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.map(order => (
                    <div key={order.id} className="glass rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-white text-sm font-bold">{order.order_number}</span>
                          <Badge className={statusColor(order.payment_status)}>{order.payment_status?.replace(/_/g, ' ')}</Badge>
                          <Badge className={statusColor(order.order_status)}>{order.order_status?.replace(/_/g, ' ')}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground capitalize">{order.package_type?.replace(/_/g, ' ')} — {order.quantity}x device</p>
                        {order.tracking_number && (
                          <p className="text-xs text-blue-400">{order.carrier}: {order.tracking_number}</p>
                        )}
                        {order.payment_status === 'pending_payment' && (
                          <div className="flex items-center gap-1 text-xs text-yellow-400 mt-1">
                            <AlertCircle className="w-3 h-3" />
                            <span>Payment pending — <Link to="/gps/checkout" className="underline hover:text-yellow-300">complete order</Link></span>
                          </div>
                        )}
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-white font-semibold">${order.total_amount?.toFixed(2)}</p>
                        <Badge className={statusColor(order.activation_status)}>
                          {order.activation_status === 'activated' ? (
                            <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Activated</span>
                          ) : order.activation_status === 'partially_activated' ? (
                            `Partial (${order.device_ids?.length || 0}/${order.quantity})`
                          ) : 'Not Activated'}
                        </Badge>
                        {order.payment_status === 'paid' && order.activation_status !== 'activated' && (
                          <div>
                            <Link to={`/gps/activate?order=${order.order_number}&email=${encodeURIComponent(order.customer_email)}`}>
                              <button className="text-xs mt-1 rounded-lg border border-white/10 px-2.5 py-1 text-white/70 hover:bg-white/5"><Zap className="w-3 h-3 inline" /> Activate</button>
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SUBSCRIPTIONS */}
            {subscriptions.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-white mb-4">Active Subscriptions</h2>
                <div className="space-y-3">
                  {subscriptions.map(sub => (
                    <div key={sub.id} className="glass rounded-xl p-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">{sub.plan_name}</p>
                        <p className="text-sm text-muted-foreground">${sub.monthly_price}/{sub.billing_cycle || 'month'}</p>
                        {sub.payment_status === 'failed' && (
                          <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Payment failed — please update payment method</p>
                        )}
                      </div>
                      <Badge className={statusColor(sub.subscription_status)}>{sub.subscription_status?.replace(/_/g, ' ')}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CTA */}
            {orders.length === 0 && (
              <div className="glass rounded-2xl p-8 border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-yellow-600/3 text-center space-y-4">
                <Shield className="w-10 h-10 text-yellow-400 mx-auto" />
                <h3 className="font-syne font-bold text-white">Protect Your Vehicle with Contactless360</h3>
                <p className="text-muted-foreground text-sm">Live GPS tracking, geofence alerts, remote controls, and theft recovery starting at $149.</p>
                <Link to="/gps"><button className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>Explore GPS Plans</button></Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}