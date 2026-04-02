import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, inputClass, textareaClass } from "@/components/shared/FormField";

const emptyForm = { customer_id: "", vehicle_id: "", booking_type: "Weekly", start_date: "", end_date: "", pickup_location: "", dropoff_location: "", status: "Reserved", notes: "" };

export default function BookingFormDialog({ open, onOpenChange, onSave, booking, isSaving }) {
  const [form, setForm] = useState(emptyForm);

  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => base44.entities.Customer.list(), enabled: open });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list(), enabled: open });
  const available = vehicles.filter((v) => v.status === "Available" || v.id === booking?.vehicle_id);

  useEffect(() => { setForm(booking ? { ...emptyForm, ...booking } : emptyForm); }, [booking, open]);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const c = customers.find((c) => c.id === form.customer_id);
    const v = vehicles.find((v) => v.id === form.vehicle_id);
    onSave({ ...form, customer_name: c?.full_name || "", vehicle_name: v ? `${v.year} ${v.make} ${v.model}` : "" });
  };

  const mkSelect = (field, options, placeholder) => (
    <Select value={form[field]} onValueChange={(v) => set(field, v)}>
      <SelectTrigger className="h-9 rounded-xl bg-white/[0.06] border-white/[0.1] text-white focus:ring-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
        {options.map((o) => typeof o === "string"
          ? <SelectItem key={o} value={o} className="focus:bg-white/10">{o}</SelectItem>
          : <SelectItem key={o.id} value={o.id} className="focus:bg-white/10">{o.label}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-white/[0.08] text-white" style={{ background: "hsl(222 28% 9%)", boxShadow: "0 24px 80px hsl(222 28% 5% / 0.9)" }}>
        <DialogHeader>
          <DialogTitle className="font-syne text-white">{booking ? "Edit Booking" : "New Booking"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <FormField label="Customer" required>
            {mkSelect("customer_id", customers.map((c) => ({ id: c.id, label: c.full_name })), "Select customer")}
          </FormField>
          <FormField label="Vehicle" required>
            {mkSelect("vehicle_id", available.map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model} — ${v.plate || "No plate"}` })), "Select vehicle")}
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Booking Type">{mkSelect("booking_type", ["Daily", "Weekly", "Monthly", "Rent-to-Own"])}</FormField>
            <FormField label="Status">{mkSelect("status", ["Reserved", "Active", "Completed", "Cancelled"])}</FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required><input type="date" className={inputClass} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} required /></FormField>
            <FormField label="End Date"><input type="date" className={inputClass} value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Pickup Location"><input className={inputClass} value={form.pickup_location} onChange={(e) => set("pickup_location", e.target.value)} /></FormField>
            <FormField label="Dropoff Location"><input className={inputClass} value={form.dropoff_location} onChange={(e) => set("dropoff_location", e.target.value)} /></FormField>
          </div>
          <FormField label="Notes"><textarea className={textareaClass} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-all">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-50 shadow-glow-sm">
              {booking ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}