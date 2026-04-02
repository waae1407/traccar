import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, inputClass } from "@/components/shared/FormField";

const emptyForm = { customer_id: "", vehicle_id: "", start_date: "", weekly_payment: "", total_contract_value: "", total_paid: 0, total_payments_required: 52, consistent_payments_made: 0, status: "Active" };

export default function RTOFormDialog({ open, onOpenChange, onSave, contract, isSaving }) {
  const [form, setForm] = useState(emptyForm);
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => base44.entities.Customer.list(), enabled: open });
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list(), enabled: open });
  const rtoVehicles = vehicles.filter((v) => v.rent_to_own_eligible || v.id === contract?.vehicle_id);

  useEffect(() => {
    setForm(contract ? { ...emptyForm, ...contract, weekly_payment: contract.weekly_payment || "", total_contract_value: contract.total_contract_value || "" } : emptyForm);
  }, [contract, open]);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const c = customers.find((c) => c.id === form.customer_id);
    const v = vehicles.find((v) => v.id === form.vehicle_id);
    onSave({ ...form, weekly_payment: Number(form.weekly_payment), total_contract_value: Number(form.total_contract_value), total_paid: Number(form.total_paid), total_payments_required: Number(form.total_payments_required), consistent_payments_made: Number(form.consistent_payments_made), customer_name: c?.full_name || "", vehicle_name: v ? `${v.year} ${v.make} ${v.model}` : "" });
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border-white/[0.08] text-white" style={{ background: "hsl(222 28% 9%)", boxShadow: "0 24px 80px hsl(222 28% 5% / 0.9)" }}>
        <DialogHeader>
          <DialogTitle className="font-syne text-white">{contract ? "Edit Contract" : "New Rent-to-Own Contract"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <FormField label="Customer" required>
            {mkSelect("customer_id", customers.map((c) => ({ id: c.id, label: c.full_name })), "Select customer")}
          </FormField>
          <FormField label="Vehicle" required>
            {mkSelect("vehicle_id", rtoVehicles.map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model}` })), "Select vehicle")}
          </FormField>
          <FormField label="Start Date">
            <input type="date" className={inputClass} value={form.start_date} onChange={(e) => set("start_date", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Weekly Payment" required><input type="number" step="0.01" className={inputClass} value={form.weekly_payment} onChange={(e) => set("weekly_payment", e.target.value)} required /></FormField>
            <FormField label="Total Value" required><input type="number" step="0.01" className={inputClass} value={form.total_contract_value} onChange={(e) => set("total_contract_value", e.target.value)} required /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Total Paid"><input type="number" step="0.01" className={inputClass} value={form.total_paid} onChange={(e) => set("total_paid", e.target.value)} /></FormField>
            <FormField label="Payments Required"><input type="number" className={inputClass} value={form.total_payments_required} onChange={(e) => set("total_payments_required", e.target.value)} /></FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Consistent Payments"><input type="number" className={inputClass} value={form.consistent_payments_made} onChange={(e) => set("consistent_payments_made", e.target.value)} /></FormField>
            <FormField label="Status">{mkSelect("status", ["Active", "At Risk", "Completed", "Cancelled"])}</FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-all">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-50 shadow-glow-sm">
              {contract ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}