import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const emptyForm = {
  customer_id: "", vehicle_id: "", start_date: "", weekly_payment: "",
  total_contract_value: "", total_paid: 0, total_payments_required: 52,
  consistent_payments_made: 0, status: "Active",
};

export default function RTOFormDialog({ open, onOpenChange, onSave, contract, isSaving }) {
  const [form, setForm] = useState(emptyForm);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
    enabled: open,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["vehicles"],
    queryFn: () => base44.entities.Vehicle.list(),
    enabled: open,
  });

  const rtoVehicles = vehicles.filter((v) => v.rent_to_own_eligible || v.id === contract?.vehicle_id);

  useEffect(() => {
    if (contract) {
      setForm({
        ...emptyForm, ...contract,
        weekly_payment: contract.weekly_payment || "",
        total_contract_value: contract.total_contract_value || "",
        total_paid: contract.total_paid || 0,
        total_payments_required: contract.total_payments_required || 52,
        consistent_payments_made: contract.consistent_payments_made || 0,
      });
    } else {
      setForm(emptyForm);
    }
  }, [contract, open]);

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const customer = customers.find((c) => c.id === form.customer_id);
    const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
    onSave({
      ...form,
      weekly_payment: Number(form.weekly_payment),
      total_contract_value: Number(form.total_contract_value),
      total_paid: Number(form.total_paid),
      total_payments_required: Number(form.total_payments_required),
      consistent_payments_made: Number(form.consistent_payments_made),
      customer_name: customer ? customer.full_name : "",
      vehicle_name: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contract ? "Edit Contract" : "New Rent-to-Own Contract"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer *</Label>
            <Select value={form.customer_id} onValueChange={(v) => handleChange("customer_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vehicle *</Label>
            <Select value={form.vehicle_id} onValueChange={(v) => handleChange("vehicle_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {rtoVehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Start Date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => handleChange("start_date", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Weekly Payment *</Label>
              <Input type="number" step="0.01" value={form.weekly_payment} onChange={(e) => handleChange("weekly_payment", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Total Value *</Label>
              <Input type="number" step="0.01" value={form.total_contract_value} onChange={(e) => handleChange("total_contract_value", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Total Paid</Label>
              <Input type="number" step="0.01" value={form.total_paid} onChange={(e) => handleChange("total_paid", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payments Required</Label>
              <Input type="number" value={form.total_payments_required} onChange={(e) => handleChange("total_payments_required", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Consistent Payments</Label>
              <Input type="number" value={form.consistent_payments_made} onChange={(e) => handleChange("consistent_payments_made", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Active", "At Risk", "Completed", "Cancelled"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{contract ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}