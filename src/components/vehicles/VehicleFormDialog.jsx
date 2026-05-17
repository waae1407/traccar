import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, inputClass } from "@/components/shared/FormField";
import VehicleExpenseList from "./VehicleExpenseList";
import { Loader } from "lucide-react";
import { calculateRentalPrice } from "@/utils/rentalPricing";

const emptyForm = {
  vin: "", plate: "", make: "", model: "", year: "", color: "",
  purchase_price: "", city: "", state: "", status: "Available",
  mileage: "", last_service_date: "", weekly_rate: "", rent_to_own_eligible: false,
  pickup_address: "", pickup_hours: "",
  moovetrax_device_id: "", contactless_pickup: false,
  // Rental duration settings
  minimum_rental_days: 7, maximum_rental_days: "", rental_duration_type: "weekly",
  daily_rate: "", monthly_rate: "",
  allow_daily_booking: false, allow_weekly_booking: true, allow_monthly_booking: false,
};

const PREVIEW_DAYS = [1, 3, 7, 14, 30];

function PricingPreview({ form }) {
  const previews = PREVIEW_DAYS.map(d => ({
    days: d,
    result: calculateRentalPrice(form, d),
  })).filter(p => p.result !== null);

  if (previews.length === 0) return null;

  return (
    <div className="mt-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2">Pricing Preview</p>
      <div className="space-y-1">
        {previews.map(({ days, result }) => (
          <div key={days} className="flex justify-between text-xs">
            <span className="text-white/50">{days} day{days > 1 ? "s" : ""}</span>
            <span className={`font-semibold ${result.derived ? "text-white/40" : "text-white/70"}`}>
              ${result.total.toFixed(2)}
              {result.derived && <span className="text-white/30 ml-1">(est.)</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function VehicleFormDialog({ open, onOpenChange, onSave, vehicle, isSaving }) {
  const [form, setForm] = useState(emptyForm);
  const [decodingVIN, setDecodingVIN] = useState(false);
  const [vinError, setVinError] = useState("");

  useEffect(() => {
    setForm(vehicle ? {
      ...emptyForm, ...vehicle,
      year: vehicle.year || "",
      purchase_price: vehicle.purchase_price || "",
      mileage: vehicle.mileage || "",
      weekly_rate: vehicle.weekly_rate || "",
      daily_rate: vehicle.daily_rate || "",
      monthly_rate: vehicle.monthly_rate || "",
      city: vehicle.city || vehicle.current_city || "",
      state: vehicle.state || "",
      pickup_address: vehicle.pickup_address || "",
      pickup_hours: vehicle.pickup_hours || "",
      moovetrax_device_id: vehicle.moovetrax_device_id || "",
      contactless_pickup: vehicle.contactless_pickup ?? false,
      minimum_rental_days: vehicle.minimum_rental_days ?? 7,
      maximum_rental_days: vehicle.maximum_rental_days || "",
      rental_duration_type: vehicle.rental_duration_type || "weekly",
      allow_daily_booking: vehicle.allow_daily_booking ?? false,
      allow_weekly_booking: vehicle.allow_weekly_booking ?? true,
      allow_monthly_booking: vehicle.allow_monthly_booking ?? false,
    } : emptyForm);
    setVinError("");
  }, [vehicle, open]);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleDecodeVIN = async () => {
    if (!form.vin || form.vin.length < 10) { setVinError("VIN must be at least 10 characters"); return; }
    setDecodingVIN(true);
    setVinError("");
    try {
      const res = await base44.functions.invoke("decodeVIN", { vin: form.vin });
      if (res.data?.year && res.data?.make && res.data?.model) {
        set("year", String(res.data.year));
        set("make", res.data.make);
        set("model", res.data.model);
      } else {
        setVinError("Could not decode VIN. Please enter manually.");
      }
    } catch {
      setVinError("VIN lookup failed. Please enter manually.");
    } finally {
      setDecodingVIN(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      year: form.year ? Number(form.year) : undefined,
      purchase_price: form.purchase_price ? Number(form.purchase_price) : undefined,
      mileage: form.mileage ? Number(form.mileage) : undefined,
      weekly_rate: form.weekly_rate ? Number(form.weekly_rate) : undefined,
      daily_rate: form.daily_rate ? Number(form.daily_rate) : undefined,
      monthly_rate: form.monthly_rate ? Number(form.monthly_rate) : undefined,
      minimum_rental_days: form.minimum_rental_days ? Number(form.minimum_rental_days) : 7,
      maximum_rental_days: form.maximum_rental_days ? Number(form.maximum_rental_days) : undefined,
    });
  };

  const sel = (field, options, placeholder) => (
    <Select value={String(form[field])} onValueChange={(v) => set(field, v)}>
      <SelectTrigger className="h-9 rounded-xl bg-white/[0.06] border-white/[0.1] text-white focus:ring-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
        {options.map((o) => <SelectItem key={o} value={o} className="focus:bg-white/10 focus:text-white">{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const toggle = (field) => (
    <button type="button" onClick={() => set(field, !form[field])}
      className={`relative h-5 w-9 rounded-full transition-all flex-shrink-0 ${form[field] ? "bg-primary" : "bg-white/10"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${form[field] ? "left-4" : "left-0.5"}`} />
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-white/[0.08] text-white" style={{ background: "hsl(222 28% 9%)", boxShadow: "0 24px 80px hsl(222 28% 5% / 0.9)" }}>
        <DialogHeader>
          <DialogTitle className="font-syne text-white">{vehicle ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Make" required><input className={inputClass} value={form.make} onChange={(e) => set("make", e.target.value)} required /></FormField>
            <FormField label="Model" required><input className={inputClass} value={form.model} onChange={(e) => set("model", e.target.value)} required /></FormField>
            <FormField label="Year" required><input type="number" className={inputClass} value={form.year} onChange={(e) => set("year", e.target.value)} required /></FormField>
          </div>
          <div className="space-y-2">
            <FormField label="VIN">
              <div className="flex gap-2">
                <input className={inputClass} value={form.vin} onChange={(e) => { set("vin", e.target.value); setVinError(""); }} placeholder="Enter full VIN" />
                <button type="button" onClick={handleDecodeVIN} disabled={decodingVIN || !form.vin}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-all text-sm font-medium whitespace-nowrap flex items-center gap-1">
                  {decodingVIN ? <><Loader className="h-3 w-3 animate-spin" /> Decode</> : "Decode"}
                </button>
              </div>
              {vinError && <p className="text-xs text-red-400 mt-1">{vinError}</p>}
            </FormField>
            <FormField label="Plate"><input className={inputClass} value={form.plate} onChange={(e) => set("plate", e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Color"><input className={inputClass} value={form.color} onChange={(e) => set("color", e.target.value)} /></FormField>
            <FormField label="City"><input className={inputClass} value={form.city} onChange={(e) => set("city", e.target.value)} /></FormField>
            <FormField label="State"><input className={inputClass} value={form.state} onChange={(e) => set("state", e.target.value)} placeholder="CA, TX..." maxLength="2" /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Purchase Price"><input type="number" className={inputClass} value={form.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} /></FormField>
            <FormField label="Mileage"><input type="number" className={inputClass} value={form.mileage} onChange={(e) => set("mileage", e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status">{sel("status", ["Available", "Booked", "Maintenance", "Transferred"])}</FormField>
            <FormField label="Last Service"><input type="date" className={inputClass} value={form.last_service_date} onChange={(e) => set("last_service_date", e.target.value)} /></FormField>
          </div>

          {/* ── Rental Settings ── */}
          <div className="space-y-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wider">⏱ Rental Duration Settings</p>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Min Rental Days">
                <input type="number" min="1" className={inputClass} value={form.minimum_rental_days}
                  onChange={(e) => set("minimum_rental_days", e.target.value)} placeholder="7" />
              </FormField>
              <FormField label="Max Rental Days (optional)">
                <input type="number" min="1" className={inputClass} value={form.maximum_rental_days}
                  onChange={(e) => set("maximum_rental_days", e.target.value)} placeholder="No limit" />
              </FormField>
            </div>

            {/* Booking type toggles */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Allow Weekly Booking</span>
                {toggle("allow_weekly_booking")}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Allow Daily Booking</span>
                {toggle("allow_daily_booking")}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/60">Allow Monthly Booking</span>
                {toggle("allow_monthly_booking")}
              </div>
            </div>

            {/* Rate inputs */}
            <div className="space-y-2">
              {form.allow_weekly_booking && (
                <FormField label="Weekly Rate ($)">
                  <input type="number" className={inputClass} value={form.weekly_rate}
                    onChange={(e) => set("weekly_rate", e.target.value)} placeholder="e.g. 350" />
                </FormField>
              )}
              {form.allow_daily_booking && (
                <FormField label="Daily Rate ($)">
                  <input type="number" className={inputClass} value={form.daily_rate}
                    onChange={(e) => set("daily_rate", e.target.value)} placeholder="e.g. 65" />
                </FormField>
              )}
              {form.allow_monthly_booking && (
                <FormField label="Monthly Rate ($)">
                  <input type="number" className={inputClass} value={form.monthly_rate}
                    onChange={(e) => set("monthly_rate", e.target.value)} placeholder="e.g. 1200" />
                </FormField>
              )}
              {!form.allow_daily_booking && !form.allow_weekly_booking && !form.allow_monthly_booking && (
                <FormField label="Weekly Rate ($)">
                  <input type="number" className={inputClass} value={form.weekly_rate}
                    onChange={(e) => set("weekly_rate", e.target.value)} placeholder="e.g. 350" />
                </FormField>
              )}
            </div>

            {/* Pricing preview */}
            <PricingPreview form={form} />
          </div>

          {/* Pickup Info */}
          <div className="space-y-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wider flex items-center gap-1.5">
              📍 Pickup Info <span className="text-white/25 font-normal normal-case tracking-normal">(revealed after payment)</span>
            </p>
            <FormField label="Full Pickup Address">
              <input className={inputClass} value={form.pickup_address} onChange={(e) => set("pickup_address", e.target.value)} placeholder="e.g. 1234 Main St, Detroit, MI 48201" />
            </FormField>
            <FormField label="Pickup Hours (optional)">
              <input className={inputClass} value={form.pickup_hours} onChange={(e) => set("pickup_hours", e.target.value)} placeholder="e.g. Mon–Fri 9am–5pm" />
            </FormField>
          </div>

          {/* Telematics / Moovetrax */}
          <div className="space-y-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-xs font-bold text-white/50 uppercase tracking-wider">📡 Telematics (Moovetrax)</p>
            <FormField label="Moovetrax Device ID">
              <input className={inputClass} value={form.moovetrax_device_id || ""} onChange={(e) => set("moovetrax_device_id", e.target.value)} placeholder="e.g. MT-123456" />
            </FormField>
            <p className="text-[10px] text-white/25">Used for remote kill switch control on payment failure. Leave blank if not equipped.</p>
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm text-white/60">Contactless Pickup</p>
                <p className="text-[10px] text-white/30">Auto-approves after payment — requires MooveTrax device</p>
              </div>
              {toggle("contactless_pickup")}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            {toggle("rent_to_own_eligible")}
            <span className="text-sm text-white/60">Rent-to-Own Eligible</span>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-all">Cancel</button>
            <button type="submit" disabled={isSaving || decodingVIN} className="px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-50 shadow-glow-sm">
              {vehicle ? "Update" : "Create"}
            </button>
          </div>
        </form>

        {vehicle && <VehicleExpenseList vehicle={vehicle} />}
      </DialogContent>
    </Dialog>
  );
}