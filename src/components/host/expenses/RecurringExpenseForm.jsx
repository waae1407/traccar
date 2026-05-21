import React, { useState } from "react";
import { X, Upload, Loader2, Calendar, DollarSign, Repeat } from "lucide-react";
import { uploadFile } from "@/utils/uploadFile";

const inputClass = "w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400 text-sm";

const CATEGORY_OPTIONS = [
  { value: "insurance", label: "Insurance" },
  { value: "gps_subscription", label: "GPS Subscription" },
  { value: "loan_payment", label: "Loan / Financing" },
  { value: "storage_parking", label: "Storage / Parking" },
  { value: "software_tools", label: "Software / Tools" },
  { value: "service_contract", label: "Service Contract" },
  { value: "registration", label: "Registration" },
  { value: "fuel", label: "Fuel Account" },
  { value: "cleaning", label: "Cleaning Service" },
  { value: "other", label: "Other" },
];

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

function getNextDueDate(startDate, frequency) {
  const d = new Date(startDate);
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
  else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

export default function RecurringExpenseForm({ vehicles, hostId, onSave, onClose }) {
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    vehicle_id: "", category: "insurance", amount: "", vendor: "",
    frequency: "monthly", start_date: new Date().toISOString().split("T")[0],
    next_due_date: "", end_date: "", tax_deductible: true, notes: "",
    receipt_url: "", status: "active",
  });

  const setF = (k, v) => {
    setForm(p => {
      const updated = { ...p, [k]: v };
      if (k === "start_date" || k === "frequency") {
        updated.next_due_date = getNextDueDate(updated.start_date, updated.frequency);
      }
      return updated;
    });
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadFile(file);
    setF("receipt_url", res.file_url);
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const vehicle = vehicles.find(v => v.id === form.vehicle_id);
    onSave({
      ...form,
      host_id: hostId,
      amount: Number(form.amount),
      vehicle_name: vehicle ? vehicle.year + " " + vehicle.make + " " + vehicle.model : "",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add Recurring Expense</h2>
            <p className="text-xs text-gray-400 mt-0.5">Track fixed costs that repeat on a schedule</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100"><X className="h-4 w-4 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Vehicle</label>
              <select className={inputClass} value={form.vehicle_id} onChange={e => setF("vehicle_id", e.target.value)}>
                <option value="">Fleet-wide (no specific vehicle)</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}{v.plate ? " · " + v.plate : ""}</option>)}
              </select>
              <p className="text-[10px] text-gray-400 mt-0.5">Leave blank for fleet-wide expenses</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Category *</label>
              <select className={inputClass} value={form.category} onChange={e => setF("category", e.target.value)}>
                {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Amount ($) *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input className={inputClass + " pl-9"} type="number" step="0.01" required value={form.amount} onChange={e => setF("amount", e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Frequency *</label>
              <div className="relative">
                <Repeat className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select className={inputClass + " pl-9"} value={form.frequency} onChange={e => setF("frequency", e.target.value)}>
                  {FREQUENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Start Date *</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input className={inputClass + " pl-9"} type="date" required value={form.start_date} onChange={e => setF("start_date", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Next Due Date *</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input className={inputClass + " pl-9"} type="date" required value={form.next_due_date} onChange={e => setF("next_due_date", e.target.value)} readOnly={form.start_date && form.frequency} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">Auto-calculated from start date + frequency</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Vendor / Provider</label>
            <input className={inputClass} value={form.vendor} onChange={e => setF("vendor", e.target.value)} placeholder="e.g. Geico, Verizon, ABC Financing" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">End Date (optional)</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input className={inputClass + " pl-9"} type="date" value={form.end_date} onChange={e => setF("end_date", e.target.value)} />
              </div>
              <p className="text-[10px] text-gray-400 mt-0.5">When this recurring expense ends</p>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2.5 cursor-pointer p-3 rounded-xl bg-gray-50 border border-gray-200">
                <input type="checkbox" checked={form.tax_deductible} onChange={e => setF("tax_deductible", e.target.checked)} className="rounded border-gray-300 text-pink-500" />
                <span className="text-sm font-semibold text-gray-700">Tax deductible expense</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
            <textarea className={inputClass + " h-20 resize-none"} value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Policy number, account details, etc." />
          </div>

          <div className="flex items-center justify-between">
            <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {form.receipt_url ? "Invoice/Receipt ✓" : "Upload Invoice/Receipt"}
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleUpload} />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100">Cancel</button>
              <button type="submit" className="px-5 py-2 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                Save Recurring Expense
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}