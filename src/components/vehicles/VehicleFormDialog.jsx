import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const emptyForm = {
  vin: "", plate: "", make: "", model: "", year: "", color: "",
  purchase_price: "", current_city: "", status: "Available",
  mileage: "", last_service_date: "", weekly_rate: "", rent_to_own_eligible: false,
};

export default function VehicleFormDialog({ open, onOpenChange, onSave, vehicle, isSaving }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (vehicle) {
      setForm({
        ...emptyForm, ...vehicle,
        year: vehicle.year || "",
        purchase_price: vehicle.purchase_price || "",
        mileage: vehicle.mileage || "",
        weekly_rate: vehicle.weekly_rate || "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [vehicle, open]);

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...form,
      year: form.year ? Number(form.year) : undefined,
      purchase_price: form.purchase_price ? Number(form.purchase_price) : undefined,
      mileage: form.mileage ? Number(form.mileage) : undefined,
      weekly_rate: form.weekly_rate ? Number(form.weekly_rate) : undefined,
    };
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vehicle ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Make *</Label>
              <Input value={form.make} onChange={(e) => handleChange("make", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Model *</Label>
              <Input value={form.model} onChange={(e) => handleChange("model", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Year *</Label>
              <Input type="number" value={form.year} onChange={(e) => handleChange("year", e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>VIN</Label>
              <Input value={form.vin} onChange={(e) => handleChange("vin", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Plate</Label>
              <Input value={form.plate} onChange={(e) => handleChange("plate", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Input value={form.color} onChange={(e) => handleChange("color", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Current City</Label>
              <Input value={form.current_city} onChange={(e) => handleChange("current_city", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Purchase Price</Label>
              <Input type="number" value={form.purchase_price} onChange={(e) => handleChange("purchase_price", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Weekly Rate</Label>
              <Input type="number" value={form.weekly_rate} onChange={(e) => handleChange("weekly_rate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mileage</Label>
              <Input type="number" value={form.mileage} onChange={(e) => handleChange("mileage", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Available", "Booked", "Maintenance", "Transferred"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Last Service Date</Label>
              <Input type="date" value={form.last_service_date} onChange={(e) => handleChange("last_service_date", e.target.value)} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={form.rent_to_own_eligible} onCheckedChange={(v) => handleChange("rent_to_own_eligible", v)} />
            <Label>Rent-to-Own Eligible</Label>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{vehicle ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}