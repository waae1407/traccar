import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { MapPin, Plus, Trash2, Shield, Power } from "lucide-react";

const ALERT_TYPES = [
  { key: "parked_movement", label: "Movement Alert", desc: "Notify if vehicle moves from parked spot" },
  { key: "radius_breach", label: "Geofence Radius", desc: "Notify if vehicle leaves a fixed area" },
  { key: "curfew", label: "Curfew Alert", desc: "Notify if vehicle moves during hours" },
];

export default function GeofenceConfig({ device, user }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    alert_name: "",
    alert_type: "parked_movement",
    radius_miles: 0.5,
    auto_kill_on_breach: false,
    curfew_start_hour: 22,
    curfew_end_hour: 6,
  });

  useEffect(() => {
    loadAlerts();
  }, [device?.id]);

  const loadAlerts = async () => {
    if (!device?.id || !user?.id) return;
    setLoading(true);
    try {
      const a = await base44.entities.GeofenceAlert.filter(
        { telematics_device_id: device.id, customer_user_id: user.id },
        "-created_date",
        20
      );
      setAlerts(a || []);
    } catch (e) {
      console.error("Failed to load geofence alerts:", e);
    }
    setLoading(false);
  };

  const createAlert = async () => {
    if (!form.alert_name.trim()) return;
    try {
      // For parked_movement, initialize parked position from current device location
      const alertData = {
        customer_user_id: user.id,
        customer_email: user.email,
        telematics_device_id: device.id,
        vehicle_id: device.vehicle_id || "",
        alert_name: form.alert_name.trim(),
        alert_type: form.alert_type,
        radius_miles: form.radius_miles,
        auto_kill_on_breach: form.auto_kill_on_breach,
        is_active: true,
        suppress_minutes: 15,
      };

      if (form.alert_type === "parked_movement" && device.last_latitude && device.last_longitude) {
        alertData.parked_lat = device.last_latitude;
        alertData.parked_lon = device.last_longitude;
      }
      if (form.alert_type === "radius_breach" && device.last_latitude && device.last_longitude) {
        alertData.center_lat = device.last_latitude;
        alertData.center_lon = device.last_longitude;
      }
      if (form.alert_type === "curfew") {
        alertData.curfew_start_hour = form.curfew_start_hour;
        alertData.curfew_end_hour = form.curfew_end_hour;
      }

      await base44.entities.GeofenceAlert.create(alertData);
      setShowForm(false);
      setForm({ alert_name: "", alert_type: "parked_movement", radius_miles: 0.5, auto_kill_on_breach: false, curfew_start_hour: 22, curfew_end_hour: 6 });
      loadAlerts();
    } catch (e) {
      console.error("Failed to create geofence alert:", e);
    }
  };

  const toggleAlert = async (alert) => {
    await base44.entities.GeofenceAlert.update(alert.id, { is_active: !alert.is_active });
    loadAlerts();
  };

  const deleteAlert = async (alertId) => {
    await base44.entities.GeofenceAlert.delete(alertId);
    loadAlerts();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={16} color="#71717A" />
          <h3 className="text-sm font-bold text-white">Geofence & Movement Alerts</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
        >
          <Plus size={14} /> New Alert
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <input
            type="text"
            placeholder="Alert name (e.g. Home geofence)"
            value={form.alert_name}
            onChange={(e) => setForm({ ...form, alert_name: e.target.value })}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <div>
            <label className="text-xs text-white/50 mb-1 block">Alert Type</label>
            <div className="space-y-2">
              {ALERT_TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setForm({ ...form, alert_type: t.key })}
                  className={`w-full text-left rounded-xl border p-3 ${
                    form.alert_type === t.key
                      ? "border-pink-500/50 bg-pink-500/10"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
                >
                  <p className="text-xs font-bold text-white">{t.label}</p>
                  <p className="text-[10px] text-white/40">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>
          {(form.alert_type === "parked_movement" || form.alert_type === "radius_breach") && (
            <div>
              <label className="text-xs text-white/50 mb-1 block">
                Radius: {form.radius_miles} miles
              </label>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={form.radius_miles}
                onChange={(e) => setForm({ ...form, radius_miles: parseFloat(e.target.value) })}
                className="w-full"
              />
            </div>
          )}
          {form.alert_type === "curfew" && (
            <div className="flex items-center gap-2">
              <select
                value={form.curfew_start_hour}
                onChange={(e) => setForm({ ...form, curfew_start_hour: parseInt(e.target.value) })}
                className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i} className="bg-zinc-900">{i}:00</option>
                ))}
              </select>
              <span className="text-xs text-white/50">to</span>
              <select
                value={form.curfew_end_hour}
                onChange={(e) => setForm({ ...form, curfew_end_hour: parseInt(e.target.value) })}
                className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i} className="bg-zinc-900">{i}:00</option>
                ))}
              </select>
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.auto_kill_on_breach}
              onChange={(e) => setForm({ ...form, auto_kill_on_breach: e.target.checked })}
              className="h-4 w-4 rounded"
            />
            <span className="text-xs text-white/70 flex items-center gap-1">
              <Power size={12} color="#FF453A" /> Auto-kill starter on breach
            </span>
          </label>
          <button
            onClick={createAlert}
            disabled={!form.alert_name.trim()}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            Create Alert
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-white/30 text-center py-4">Loading alerts…</p>
      ) : alerts.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-4">
          No geofence alerts yet. Create one to get notified if your vehicle moves unexpectedly.
        </p>
      ) : (
        alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleAlert(alert)}
                className={`h-5 w-9 rounded-full transition-all ${alert.is_active ? "bg-green-500/40" : "bg-white/10"}`}
              >
                <div
                  className={`h-4 w-4 rounded-full bg-white transition-all ${alert.is_active ? "translate-x-4" : "translate-x-0.5"}`}
                />
              </button>
              <div>
                <p className="text-xs font-semibold text-white/80">{alert.alert_name}</p>
                <p className="text-[10px] text-white/40">
                  {alert.alert_type?.replace(/_/g, " ")} · {alert.radius_miles}mi
                  {alert.auto_kill_on_breach ? " · auto-kill" : ""}
                  {alert.breach_count > 0 ? ` · ${alert.breach_count} breaches` : ""}
                </p>
              </div>
            </div>
            <button onClick={() => deleteAlert(alert.id)} className="text-white/30 hover:text-red-400">
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}