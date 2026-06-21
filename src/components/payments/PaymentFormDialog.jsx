import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField, inputClass } from "@/components/shared/FormField";
import { toast } from "sonner";

const emptyForm = { customer_id: "", booking_id: "", amount: "", payment_type: "Rental", payment_method: "Card", status: "Paid", due_date: "", paid_date: new Date().toISOString().split("T")[0] };

export default function PaymentFormDialog({ open, onOpenChange, onSave, payment, isSaving }) {
  const [form, setForm] = useState(emptyForm);
  const { data: customers = [] } = useQuery({ queryKey: ["customers"], queryFn: () => base44.entities.Customer.list(), enabled: open });
  const { data: bookings = [] } = useQuery({ queryKey: ["bookings-request"], queryFn: () => base44.entities.BookingRequest.list(), enabled: open });

  useEffect(() => { setForm(payment ? { ...emptyForm, ...payment, amount: payment.amount || "" } : emptyForm); }, [payment, open]);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));
  const customerBookings = form.customer_id ? bookings.filter((b) => {
    const c = customers.find(cust => cust.id === form.customer_id);
    return b.user_email === c?.email || b.customer_full_name === c?.full_name;
  }) : [];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.booking_id) {
      toast.error("Please select a booking");
      return;
    }
    const c = customers.find((c) => c.id === form.customer_id);
    onSave({ ...form, amount: Number(form.amount), customer_name: c?.full_name || "" });
  };

  const mkSelect = (field, options) => (
    <Select value={form[field]} onValueChange={(v) => set(field, v)}>
      <SelectTrigger className="h-9 rounded-xl bg-white/[0.06] border-white/[0.1] text-white focus:ring-0">
        <SelectValue />
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
          <DialogTitle className="font-syne text-white">{payment ? "Edit Payment" : "Record Payment"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <FormField label="Customer" required>
            <Select value={form.customer_id} onValueChange={(v) => set("customer_id", v)}>
              <SelectTrigger className="h-9 rounded-xl bg-white/[0.06] border-white/[0.1] text-white focus:ring-0">
                <SelectValue placeholder="Select customer" />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
                {customers.map((c) => <SelectItem key={c.id} value={c.id} className="focus:bg-white/10">{c.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Booking" required>
            {customerBookings.length > 0 ? (
              mkSelect("booking_id", customerBookings.map((b) => ({ id: b.id, label: `${b.vehicle_name} — ${b.booking_type || 'Booking'}` })))
            ) : (
              <div className="text-xs text-white/50 h-9 flex items-center">Please select a customer with active bookings</div>
            )}
          </FormField>
          <FormField label="Amount" required>
            <input type="number" step="0.01" className={inputClass} value={form.amount} onChange={(e) => set("amount", e.target.value)} required />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">{mkSelect("payment_type", ["Deposit", "Rental", "Late Fee"])}</FormField>
            <FormField label="Method">{mkSelect("payment_method", ["Card", "Cash", "Zelle", "ACH"])}</FormField>
          </div>
          <FormField label="Status">{mkSelect("status", ["Paid", "Pending", "Failed", "Overdue"])}</FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Due Date"><input type="date" className={inputClass} value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></FormField>
            <FormField label="Paid Date"><input type="date" className={inputClass} value={form.paid_date} onChange={(e) => set("paid_date", e.target.value)} /></FormField>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-all">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-50 shadow-glow-sm">
              {payment ? "Update" : "Record"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}