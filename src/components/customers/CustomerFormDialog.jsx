import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { Upload } from "lucide-react";

const emptyForm = {
  full_name: "", phone: "", email: "", address: "", employer: "",
  weekly_income: "", status: "Lead", lead_source: "", notes: "",
  driver_license_url: "", id_upload_url: "",
};

export default function CustomerFormDialog({ open, onOpenChange, onSave, customer, isSaving }) {
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (customer) {
      setForm({ ...emptyForm, ...customer, weekly_income: customer.weekly_income || "" });
    } else {
      setForm(emptyForm);
    }
  }, [customer, open]);

  const handleChange = (field, value) => setForm((p) => ({ ...p, [field]: value }));

  const handleUpload = async (field, file) => {
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    handleChange(field, file_url);
    setUploading(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form, weekly_income: form.weekly_income ? Number(form.weekly_income) : undefined };
    onSave(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "Add Customer"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={(e) => handleChange("full_name", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Phone *</Label>
              <Input value={form.phone} onChange={(e) => handleChange("phone", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => handleChange("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Lead Source</Label>
              <Select value={form.lead_source} onValueChange={(v) => handleChange("lead_source", v)}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {["Turo", "Facebook", "Referral", "Website", "Other"].map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => handleChange("address", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Employer</Label>
              <Input value={form.employer} onChange={(e) => handleChange("employer", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Weekly Income</Label>
              <Input type="number" value={form.weekly_income} onChange={(e) => handleChange("weekly_income", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => handleChange("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Lead", "Approved", "Active", "Completed", "Blocked"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Driver License</Label>
              {form.driver_license_url ? (
                <p className="text-xs text-green-600">Uploaded ✓</p>
              ) : (
                <label className="flex items-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted text-sm text-muted-foreground">
                  <Upload className="h-4 w-4" /> Upload
                  <input type="file" className="hidden" onChange={(e) => e.target.files[0] && handleUpload("driver_license_url", e.target.files[0])} />
                </label>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>ID Upload</Label>
              {form.id_upload_url ? (
                <p className="text-xs text-green-600">Uploaded ✓</p>
              ) : (
                <label className="flex items-center gap-2 p-2 border border-dashed rounded-lg cursor-pointer hover:bg-muted text-sm text-muted-foreground">
                  <Upload className="h-4 w-4" /> Upload
                  <input type="file" className="hidden" onChange={(e) => e.target.files[0] && handleUpload("id_upload_url", e.target.files[0])} />
                </label>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => handleChange("notes", e.target.value)} rows={3} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isSaving || uploading}>{customer ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}