import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, Loader } from "lucide-react";
import { format } from "date-fns";

const EXPENSE_TYPES = [
  { value: "purchase", label: "Purchase" },
  { value: "repair", label: "Repair" },
  { value: "maintenance", label: "Maintenance" },
  { value: "insurance", label: "Insurance" },
  { value: "registration", label: "Registration" },
  { value: "fuel", label: "Fuel" },
  { value: "other", label: "Other" },
];

export default function VehicleExpenseForm({ vehicle, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    expense_type: "repair",
    amount: "",
    description: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
    notes: "",
  });
  const [receipt, setReceipt] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data) => {
      let receipt_url = null;
      if (receipt) {
        setUploading(true);
        const uploadRes = await base44.integrations.Core.UploadFile({ file: receipt });
        receipt_url = uploadRes.file_url;
      }
      return base44.entities.VehicleExpense.create({
        company_id: vehicle.company_id,
        vehicle_id: vehicle.id,
        vehicle_name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        receipt_url,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-expenses", vehicle.id] });
      setFormData({
        expense_type: "repair",
        amount: "",
        description: "",
        expense_date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
      });
      setReceipt(null);
      setReceiptPreview(null);
      onOpenChange(false);
    },
  });

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceipt(file);
      const reader = new FileReader();
      reader.onload = (evt) => setReceiptPreview(evt.target?.result);
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.amount) return;
    createMutation.mutate({
      expense_type: formData.expense_type,
      amount: parseFloat(formData.amount),
      description: formData.description,
      expense_date: formData.expense_date,
      notes: formData.notes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Expense</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Type</label>
            <Select value={formData.expense_type} onValueChange={(v) => setFormData({ ...formData, expense_type: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Amount *</label>
            <Input
              type="number"
              step="0.01"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Date *</label>
            <Input
              type="date"
              value={formData.expense_date}
              onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Description</label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Oil change, tire replacement"
              className="h-20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Receipt (optional)</label>
            <label className="flex items-center justify-center w-full px-4 py-3 border border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-600">
                  {receipt ? "Receipt selected" : "Click to upload"}
                </span>
              </div>
              <input type="file" onChange={handleFileChange} accept="image/*,.pdf" className="hidden" />
            </label>
            {receiptPreview && (
              <div className="mt-2 relative">
                {receipt?.type.startsWith("image") ? (
                  <img src={receiptPreview} alt="Receipt preview" className="w-full h-32 object-cover rounded-lg" />
                ) : (
                  <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center text-sm text-gray-600">
                    📄 {receipt?.name}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setReceipt(null);
                    setReceiptPreview(null);
                  }}
                  className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Notes</label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes"
              className="h-16"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending || uploading || !formData.amount}
              className="flex-1 gap-2"
            >
              {createMutation.isPending || uploading ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Add Expense"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}