import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { Loader2, AlertTriangle } from "lucide-react";

const RECEIVABLE_REASONS = [
  { value: "admin_adjustment", label: "Admin Adjustment — Swept fees / bank error" },
  { value: "marketplace_commission", label: "Marketplace Commission — Uncollected platform fee" },
  { value: "manual_payment_fee", label: "Manual Payment Fee — Zelle/cash/check fee owed" },
  { value: "chargeback_recovery", label: "Chargeback Recovery — Dispute reversal" },
];

export default function CreateReceivableDialog({ open, onClose, hosts, onSuccess }) {
  const { toast } = useToast();
  const [hostId, setHostId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("admin_adjustment");
  const [description, setDescription] = useState("");
  const [offsetPayouts, setOffsetPayouts] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedHost = hosts.find((h) => h.id === hostId);

  const reset = () => {
    setHostId("");
    setAmount("");
    setReason("admin_adjustment");
    setDescription("");
    setOffsetPayouts(true);
  };

  const handleSubmit = async () => {
    if (!hostId) return toast({ title: "Select a host", variant: "destructive" });
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return toast({ title: "Enter a valid amount", variant: "destructive" });
    if (!description.trim()) return toast({ title: "Add a description", variant: "destructive" });

    setSaving(true);
    try {
      await base44.entities.HostReceivable.create({
        host_id: hostId,
        receivable_type: reason,
        source_payment_type: "stripe",
        payment_method: "stripe",
        platform_fee_amount_due: amt,
        host_net_after_fee: 0,
        plan_mode: "marketplace_partner",
        status: "open",
        original_amount: amt,
        remaining_amount: amt,
        recovered_amount: 0,
        currency: "usd",
        offset_from_future_payouts: offsetPayouts,
        description: description.trim(),
        liability_reason: RECEIVABLE_REASONS.find((r) => r.value === reason)?.label || reason,
        created_by_admin: "admin",
        created_at: new Date().toISOString(),
        audit_log: [
          {
            action: "created",
            amount: amt,
            changed_at: new Date().toISOString(),
            changed_by: "admin",
            note: description.trim(),
          },
        ],
      });

      toast({ title: `Receivable created — $${amt.toFixed(2)} will offset from future payouts` });
      reset();
      onSuccess?.();
      onClose();
    } catch (err) {
      toast({ title: "Failed to create receivable", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-white">Create Host Receivable</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Host</Label>
            <select
              value={hostId}
              onChange={(e) => setHostId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white"
            >
              <option value="">Select host...</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.full_name} — {h.email}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Amount (USD)</Label>
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="192.61"
              className="bg-background border-border text-white"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Reason</Label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white"
            >
              {RECEIVABLE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Platform fees swept to host bank account — recovering from future payouts"
              rows={3}
              className="bg-background border-border text-white resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={offsetPayouts}
              onChange={(e) => setOffsetPayouts(e.target.checked)}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-sm text-white/70">Auto-offset from future payouts</span>
          </label>

          {offsetPayouts && selectedHost && amount && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-white/60">
                {selectedHost.full_name}'s next payout will be reduced by{" "}
                <span className="font-bold text-white">${parseFloat(amount || 0).toFixed(2)}</span> until fully
                recovered.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/60">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="bg-primary text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Receivable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}