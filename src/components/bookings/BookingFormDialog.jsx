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
  customer_id: "", vehicle_id: "", booking_type: "Weekly",
  start_date: "", end_date: "", pickup_location: "", dropoff_location: "",
  status: "Reserved", notes: "",
};

export default function BookingFormDialog({ open, onOpenChange, onSave, booking, isSaving }) {
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

  const availableVehicles = vehicles.filter((v) => v.status === "Available" || v.id === booking?.vehicle_id);

  useEffect(() => {
    if (booking) {
      setForm({ ...emptyForm, ...booking });
    } else {
      setForm(emptyForm);
    }
  }, [booking, open]);

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const customer = customers.find((c) => c.id === form.customer_id);
    const vehicle = vehicles.find((v) => v.id === form.vehicle_id);
    onSave({
      ...form,
      customer_name: customer ? customer.full_name : "",
      vehicle_name: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{booking ? "Edit Booking" : "New Booking"}</DialogTitle>
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
                {availableVehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model} — {v.plate || "No plate"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Booking Type</Label>
              <Select value={form.booking_type} onValueChange={(v) => handleChange("booking_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Daily", "Weekly", "Monthly", "Rent-to-Own"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Reserved", "Active", "Completed", "Cancelled"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start Date *</Label>
              <Input type="date" value={form.start_date} onChange={(e) => handleChange("start_date", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => handleChange("end_date", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Pickup Location</Label>
              <Input value={form.pickup_location} onChange={(e) => handleChange("pickup_location", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Dropoff Location</Label>
              <Input value={form.dropoff_location} onChange={(e) => handleChange("dropoff_location", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{booking ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}