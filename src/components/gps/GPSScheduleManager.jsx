import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Clock, Plus, Trash2, Power, Lock, Unlock, Volume2, Bell } from "lucide-react";

const COMMAND_OPTIONS = [
  { key: "lock", label: "Lock", icon: Lock },
  { key: "unlock", label: "Unlock", icon: Unlock },
  { key: "disable_starter", label: "Kill Switch", icon: Power },
  { key: "restore_starter", label: "Restore Starter", icon: Power },
  { key: "alarm_pulse", label: "Alarm", icon: Volume2 },
];

const TRIGGER_OPTIONS = [
  { key: "daily_time", label: "Daily at specific time" },
  { key: "parked_duration", label: "After parked for X minutes" },
  { key: "sunset", label: "At sunset (~6 PM)" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function GPSScheduleManager({ device, user }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    rule_name: "",
    command_type: "lock",
    trigger_type: "daily_time",
    trigger_time: "22:00",
    trigger_parked_minutes: 30,
    active_days: [],
  });

  useEffect(() => {
    loadRules();
  }, [device?.id]);

  const loadRules = async () => {
    if (!device?.id || !user?.id) return;
    setLoading(true);
    try {
      const r = await base44.entities.GPSScheduleRule.filter(
        { telematics_device_id: device.id, customer_user_id: user.id },
        "-created_date",
        20
      );
      setRules(r || []);
    } catch (e) {
      console.error("Failed to load schedule rules:", e);
    }
    setLoading(false);
  };

  const toggleDay = (day) => {
    setForm((prev) => ({
      ...prev,
      active_days: prev.active_days.includes(day)
        ? prev.active_days.filter((d) => d !== day)
        : [...prev.active_days, day],
    }));
  };

  const createRule = async () => {
    if (!form.rule_name.trim()) return;
    try {
      await base44.entities.GPSScheduleRule.create({
        customer_user_id: user.id,
        customer_email: user.email,
        telematics_device_id: device.id,
        vehicle_id: device.vehicle_id || "",
        rule_name: form.rule_name.trim(),
        command_type: form.command_type,
        trigger_type: form.trigger_type,
        trigger_time: form.trigger_type === "daily_time" ? form.trigger_time : "",
        trigger_parked_minutes: form.trigger_type === "parked_duration" ? form.trigger_parked_minutes : 0,
        active_days: form.active_days,
        is_active: true,
      });
      setShowForm(false);
      setForm({ rule_name: "", command_type: "lock", trigger_type: "daily_time", trigger_time: "22:00", trigger_parked_minutes: 30, active_days: [] });
      loadRules();
    } catch (e) {
      console.error("Failed to create rule:", e);
    }
  };

  const toggleRule = async (rule) => {
    await base44.entities.GPSScheduleRule.update(rule.id, { is_active: !rule.is_active });
    loadRules();
  };

  const deleteRule = async (ruleId) => {
    await base44.entities.GPSScheduleRule.delete(ruleId);
    loadRules();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} color="#71717A" />
          <h3 className="text-sm font-bold text-white">Automated Schedules</h3>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
        >
          <Plus size={14} /> New Rule
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <input
            type="text"
            placeholder="Rule name (e.g. Auto-lock at night)"
            value={form.rule_name}
            onChange={(e) => setForm({ ...form, rule_name: e.target.value })}
            className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-pink-500/50"
          />
          <div>
            <label className="text-xs text-white/50 mb-1 block">Action</label>
            <div className="grid grid-cols-3 gap-2">
              {COMMAND_OPTIONS.map((cmd) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.key}
                    onClick={() => setForm({ ...form, command_type: cmd.key })}
                    className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-xs ${
                      form.command_type === cmd.key
                        ? "border-pink-500/50 bg-pink-500/10 text-white"
                        : "border-white/10 text-white/60"
                    }`}
                  >
                    <Icon size={16} />
                    {cmd.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="text-xs text-white/50 mb-1 block">When</label>
            <select
              value={form.trigger_type}
              onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            >
              {TRIGGER_OPTIONS.map((t) => (
                <option key={t.key} value={t.key} className="bg-zinc-900">{t.label}</option>
              ))}
            </select>
          </div>
          {form.trigger_type === "daily_time" && (
            <input
              type="time"
              value={form.trigger_time}
              onChange={(e) => setForm({ ...form, trigger_time: e.target.value })}
              className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
            />
          )}
          {form.trigger_type === "parked_duration" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="5"
                max="1440"
                value={form.trigger_parked_minutes}
                onChange={(e) => setForm({ ...form, trigger_parked_minutes: parseInt(e.target.value) || 30 })}
                className="w-24 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
              />
              <span className="text-xs text-white/50">minutes after parking</span>
            </div>
          )}
          <div>
            <label className="text-xs text-white/50 mb-1 block">Days (empty = every day)</label>
            <div className="flex gap-1">
              {DAYS.map((day, i) => (
                <button
                  key={day}
                  onClick={() => toggleDay(i)}
                  className={`flex-1 rounded-lg py-1.5 text-[10px] font-bold ${
                    form.active_days.includes(i)
                      ? "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                      : "bg-white/5 text-white/40 border border-white/10"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={createRule}
            disabled={!form.rule_name.trim()}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
          >
            Create Schedule
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-white/30 text-center py-4">Loading schedules…</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-white/30 text-center py-4">
          No schedules yet. Create one to auto-lock or auto-kill at specific times.
        </p>
      ) : (
        rules.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleRule(rule)}
                className={`h-5 w-9 rounded-full transition-all ${rule.is_active ? "bg-green-500/40" : "bg-white/10"}`}
              >
                <div
                  className={`h-4 w-4 rounded-full bg-white transition-all ${rule.is_active ? "translate-x-4" : "translate-x-0.5"}`}
                />
              </button>
              <div>
                <p className="text-xs font-semibold text-white/80">{rule.rule_name}</p>
                <p className="text-[10px] text-white/40">
                  {rule.command_type?.replace(/_/g, " ")} ·{" "}
                  {rule.trigger_type === "daily_time" ? `Daily at ${rule.trigger_time}` : ""}
                  {rule.trigger_type === "parked_duration" ? `After ${rule.trigger_parked_minutes}m parked` : ""}
                  {rule.trigger_type === "sunset" ? "At sunset" : ""}
                </p>
              </div>
            </div>
            <button onClick={() => deleteRule(rule.id)} className="text-white/30 hover:text-red-400">
              <Trash2 size={14} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}