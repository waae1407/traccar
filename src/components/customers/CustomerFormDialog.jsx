import { uploadFile } from "@/utils/uploadFile";
import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { Upload, Check } from "lucide-react";
import { FormField, inputClass, textareaClass } from "@/components/shared/FormField";

const emptyForm = {
  full_name: "", phone: "", email: "", address: "", employer: "",
  weekly_income: "", status: "Lead", lead_source: "", notes: "",
  driver_license_url: "", id_upload_url: "",
};

export default function CustomerFormDialog({ open, onOpenChange, onSave, customer, isSaving }) {
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setForm(customer ? { ...emptyForm, ...customer, weekly_income: customer.weekly_income || "" } : emptyForm);
  }, [customer, open]);

  const set = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleUpload = async (field, file) => {
    setUploading(true);
    const { file_url } = await uploadFile(file);
    set(field, file_url);
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({ ...form, weekly_income: form.weekly_income ? Number(form.weekly_income) : undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-white/[0.08] text-white" style={{ background: "hsl(222 28% 9%)", boxShadow: "0 24px 80px hsl(222 28% 5% / 0.9)" }}>
        <DialogHeader>
          <DialogTitle className="font-syne text-white">{customer ? "Edit Customer" : "Add Customer"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Full Name" required>
              <input className={inputClass} value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
            </FormField>
            <FormField label="Phone" required>
              <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} required />
            </FormField>
            <FormField label="Email">
              <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
            </FormField>
            <FormField label="Lead Source">
              <Select value={form.lead_source} onValueChange={(v) => set("lead_source", v)}>
                <SelectTrigger className="h-9 rounded-xl bg-white/[0.06] border-white/[0.1] text-white focus:ring-0">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
                  {["Turo", "Facebook", "Referral", "Website", "Other"].map((s) => (
                    <SelectItem key={s} value={s} className="focus:bg-white/10 focus:text-white">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <FormField label="Address">
            <input className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Employer">
              <input className={inputClass} value={form.employer} onChange={(e) => set("employer", e.target.value)} />
            </FormField>
            <FormField label="Weekly Income">
              <input type="number" className={inputClass} value={form.weekly_income} onChange={(e) => set("weekly_income", e.target.value)} />
            </FormField>
          </div>
          <FormField label="Status">
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="h-9 rounded-xl bg-white/[0.06] border-white/[0.1] text-white focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
                {["Lead", "Approved", "Active", "Completed", "Blocked"].map((s) => (
                  <SelectItem key={s} value={s} className="focus:bg-white/10 focus:text-white">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            {[["driver_license_url", "Driver License"], ["id_upload_url", "ID Upload"]].map(([field, label]) => (
              <FormField key={field} label={label}>
                {form[field] ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
                    <Check className="h-4 w-4" /> Uploaded
                  </div>
                ) : (
                  <label className="flex items-center gap-2 h-9 px-3 rounded-xl bg-white/[0.06] border border-dashed border-white/[0.1] cursor-pointer hover:bg-white/[0.08] text-white/40 text-sm transition-all">
                    <Upload className="h-4 w-4" /> Upload file
                    <input type="file" className="hidden" onChange={(e) => e.target.files[0] && handleUpload(field, e.target.files[0])} />
                  </label>
                )}
              </FormField>
            ))}
          </div>
          <FormField label="Notes">
            <textarea className={textareaClass} rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => onOpenChange(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-white/60 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 transition-all">Cancel</button>
            <button type="submit" disabled={isSaving || uploading} className="px-4 py-2 rounded-xl text-sm font-semibold text-white gradient-primary hover:opacity-90 transition-all disabled:opacity-50 shadow-glow-sm">
              {customer ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}