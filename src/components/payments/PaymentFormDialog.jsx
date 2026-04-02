import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const emptyForm = {
  customer_id: "", booking_id: "", amount: "", payment_type: "Rental",
  payment_method: "Card", status: "Pending", due_date: "", paid_date: "",
};

export default function PaymentFormDialog({ open, onOpenChange, onSave, payment, isSaving }) {
  const [form, setForm] = useState(emptyForm);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => base44.entities.Customer.list(),
    enabled: open,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => base44.entities.Booking.list(),
    enabled: open,
  });

  useEffect(() => {
    if (payment) {
      setForm({ ...emptyForm, ...payment, amount: payment.amount || "" });
    } else {
      setForm(emptyForm);
    }
  }, [payment, open]);

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const customerBookings = bookings.filter((b) => b.customer_id === form.customer_id);

  const handleSubmit = (e) => {
    e.preventDefault();
    const customer = customers.find((c) => c.id === form.customer_id);
    onSave({
      ...form,
      amount: Number(form.amount),
      customer_name: customer ? customer.full_name : "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{payment ? "Edit Payment" : "Record Payment"}</DialogTitle>
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
          {customerBookings.length > 0 && (
            <div className="space-y-1.5">
              <Label>Booking</Label>
              <Select value={form.booking_id} onValueChange={(v) => handleChange("booking_id", v)}>
                <SelectTrigger><SelectValue placeholder="Select booking" /></SelectTrigger>
                <SelectContent>
                  {customerBookings.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.vehicle_name} — {b.booking_type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input type="number" step="0.01" value={form.amount} onChange={(e) => handleChange("amount", e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Payment Type</Label>
              <Select value={form.payment_type} onValueChange={(v) => handleChange("payment_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Deposit", "Rental", "Late Fee"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={form.payment_method} onValueChange={(v) => handleChange("payment_method", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Card", "Cash", "Zelle", "ACH"].map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Paid", "Pending", "Failed", "Overdue"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={(e) => handleChange("due_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Paid Date</Label>
              <Input type="date" value={form.paid_date} onChange={(e) => handleChange("paid_date", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving}>{payment ? "Update" : "Record"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}