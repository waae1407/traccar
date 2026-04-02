import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, inputClass, textareaClass } from "@/components/shared/FormField";

const emptyForm = { vehicle_id: "", service_type: "", cost: "", date: "", notes: "", next_service_due: "" };

export default function MaintenanceFormDialog({ open, onOpenChange, onSave, record, isSaving }) {
  const [form, setForm] = useState(emptyForm);
  const { data: vehicles = [] } = useQuery({ queryKey: ["vehicles"], queryFn: () => base44.entities.Vehicle.list(), enabled: open });

  useEffect(() => { setForm(record ? { ...emptyForm, ...record, cost: record.cost || "" } : emptyForm); }, [record, open]);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const v = vehicles.find((v) => v.id === form.vehicle_id);
    onSave({ ...form, cost: form.cost ? Number(form.cost) : undefined, vehicle_name: v ? `${v.year} ${v.make} ${v.model}` : "" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border-white/[0.08] text-white" style={{ background: "hsl(222 28% 9%)", boxShadow: "0 24px 80px hsl(222 28% 5% / 0.9)" }}>
        <DialogHeader>
          <DialogTitle className="font-syne text-white">{record ? "Edit Record" : "Log Maintenance"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <FormField label="Vehicle" required>
            <Select value={form.vehicle_id} onValueChange={(v) => set("vehicle_id", v)}>
              <SelectTrigger className="h-9 rounded-xl bg-white/[0.06] border-white/[0.1] text-white focus:ring-0">
                <SelectValue placeholder="Select vehicle" />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
                {vehicles.map((v) => <SelectItem key={v.id} value={v.id} className="focus:bg-white/10">{v.year} {v.make} {v.model} — {v.plate || "No plate"}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Service Type" required>
            <input className={inputClass} placeholder="Oil Change, Tires, Brakes..." value={form.service_type} onChange={(e) => set("service_type", e.target.value)} required />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Cost"><input type="number" step="0.01" className={inputClass} value={form.cost} onChange={(e) => set("cost", e.target.value)} /></FormField>
            <FormField label="Date" required><input type="date" className={inputClass} value={form.date} onChange={(e) => set("date", e.target.value)} required /></FormField>
          </div>
          <FormField label="Next Service Due">
            <input type="date" className={inputClass} value={form.next_service_due} onChange={(e) => set("next_service_due", e.target.value)} />
          </FormField>
          <FormField label="Notes">
            <textarea className={textareaClass} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-all">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-50 shadow-glow-sm">
              {record ? "Update" : "Log Service"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}