import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, inputClass } from "@/components/shared/FormField";
import VehicleExpenseList from "./VehicleExpenseList";
import { Loader } from "lucide-react";

const emptyForm = {
  vin: "", plate: "", make: "", model: "", year: "", color: "",
  purchase_price: "", current_city: "", status: "Available",
  mileage: "", last_service_date: "", weekly_rate: "", rent_to_own_eligible: false,
};

export default function VehicleFormDialog({ open, onOpenChange, onSave, vehicle, isSaving }) {
  const [form, setForm] = useState(emptyForm);
  const [decodingVIN, setDecodingVIN] = useState(false);
  const [vinError, setVinError] = useState("");

  useEffect(() => {
    setForm(vehicle ? { ...emptyForm, ...vehicle, year: vehicle.year || "", purchase_price: vehicle.purchase_price || "", mileage: vehicle.mileage || "", weekly_rate: vehicle.weekly_rate || "" } : emptyForm);
    setVinError("");
  }, [vehicle, open]);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleDecodeVIN = async () => {
    if (!form.vin || form.vin.length < 10) {
      setVinError("VIN must be at least 10 characters");
      return;
    }

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
    } catch (err) {
      setVinError("VIN lookup failed. Please enter manually.");
    } finally {
      setDecodingVIN(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, year: form.year ? Number(form.year) : undefined, purchase_price: form.purchase_price ? Number(form.purchase_price) : undefined, mileage: form.mileage ? Number(form.mileage) : undefined, weekly_rate: form.weekly_rate ? Number(form.weekly_rate) : undefined });
  };

  const sel = (field, options, placeholder) => (
    <Select value={form[field]} onValueChange={(v) => set(field, v)}>
      <SelectTrigger className="h-9 rounded-xl bg-white/[0.06] border-white/[0.1] text-white focus:ring-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
        {options.map((o) => <SelectItem key={o} value={o} className="focus:bg-white/10 focus:text-white">{o}</SelectItem>)}
      </SelectContent>
    </Select>
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
                <button
                  type="button"
                  onClick={handleDecodeVIN}
                  disabled={decodingVIN || !form.vin}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 transition-all text-sm font-medium whitespace-nowrap flex items-center gap-1"
                >
                  {decodingVIN ? <><Loader className="h-3 w-3 animate-spin" /> Decode</> : "Decode"}
                </button>
              </div>
              {vinError && <p className="text-xs text-red-400 mt-1">{vinError}</p>}
            </FormField>
            <FormField label="Plate"><input className={inputClass} value={form.plate} onChange={(e) => set("plate", e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Color"><input className={inputClass} value={form.color} onChange={(e) => set("color", e.target.value)} /></FormField>
            <FormField label="Current City"><input className={inputClass} value={form.current_city} onChange={(e) => set("current_city", e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Purchase Price"><input type="number" className={inputClass} value={form.purchase_price} onChange={(e) => set("purchase_price", e.target.value)} /></FormField>
            <FormField label="Weekly Rate"><input type="number" className={inputClass} value={form.weekly_rate} onChange={(e) => set("weekly_rate", e.target.value)} /></FormField>
            <FormField label="Mileage"><input type="number" className={inputClass} value={form.mileage} onChange={(e) => set("mileage", e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Status">{sel("status", ["Available", "Booked", "Maintenance", "Transferred"])}</FormField>
            <FormField label="Last Service"><input type="date" className={inputClass} value={form.last_service_date} onChange={(e) => set("last_service_date", e.target.value)} /></FormField>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <button type="button" onClick={() => set("rent_to_own_eligible", !form.rent_to_own_eligible)}
              className={`relative h-5 w-9 rounded-full transition-all flex-shrink-0 ${form.rent_to_own_eligible ? "bg-primary" : "bg-white/10"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${form.rent_to_own_eligible ? "left-4" : "left-0.5"}`} />
            </button>
            <span className="text-sm text-white/60">Rent-to-Own Eligible</span>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-all">Cancel</button>
            <button type="submit" disabled={isSaving || decodingVIN} className="px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-50 shadow-glow-sm">
              {vehicle ? "Update" : "Create"}
            </button>
          </div>
        </form>

        {vehicle && (
          <VehicleExpenseList vehicle={vehicle} />
        )}
      </DialogContent>
    </Dialog>
  );
}