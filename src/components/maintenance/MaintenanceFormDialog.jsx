import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const emptyForm = {
  vehicle_id: "", service_type: "", cost: "", date: "", notes: "", next_service_due: "",
};

export default function MaintenanceFormDialog({ open, onOpenChange, onSave, record, isSaving }) {
  const [form, setForm] = useState(emptyForm);

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => base44.entities.Vehicle.list(),
    enabled: open,
  });

  useEffect(() => {
    if (record) {
      setForm({ ...emptyForm, ...record, cost: record.cost || "" });
    } else {
      setForm(emptyForm);
    }
  }, [record, open]);

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
    onSave({
      ...form,
      cost: form.cost ? Number(form.cost) : undefined,
      vehicle_name: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{record ? "Edit Record" : "Log Maintenance"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vehicle *</Label>
            <Select value={form.vehicle_id} onValueChange={(v) => handleChange("vehicle_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model} — {v.plate || "No plate"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Service Type *</Label>
            <Input value={form.service_type} onChange={(e) => handleChange("service_type", e.target.value)} placeholder="Oil Change, Tires, Brakes..." required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cost</Label>
              <Input type="number" step="0.01" value={form.cost} onChange={(e) => handleChange("cost", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.date} onChange={(e) => handleChange("date", e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Next Service Due</Label>
            <Input type="date" value={form.next_service_due} onChange={(e) => handleChange("next_service_due", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{record ? "Update" : "Log"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}