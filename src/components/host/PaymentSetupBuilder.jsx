import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ExternalLink, Eye, Save } from "lucide-react";
import { Link } from "react-router-dom";

const METHOD_OPTIONS = ["Zelle", "Cash App", "Venmo", "Manual invoice", "Bank transfer", "Cash", "Other"];

export default function PaymentSetupBuilder({ plan, settings, saving, enabling, onSave, onEnableUridePayments }) {
  const [form, setForm] = useState(() => ({
    payment_mode: settings?.payment_mode || plan?.payment_mode || "own_payments",
    accepted_payment_methods: settings?.accepted_payment_methods || [],
    payment_instructions: settings?.payment_instructions || "",
    payment_link: settings?.payment_link || "",
    zelle_note: settings?.zelle_note || "",
    cash_app_note: settings?.cash_app_note || "",
    venmo_note: settings?.venmo_note || "",
    manual_invoice_note: settings?.manual_invoice_note || "",
    deposit_instructions: settings?.deposit_instructions || "",
    late_fee_policy: settings?.late_fee_policy || "",
    cancellation_policy: settings?.cancellation_policy || "",
    booking_confirmation_mode: settings?.booking_confirmation_mode || "manual_host_approval",
    manual_payment_proof_required: settings?.manual_payment_proof_required || false,
    payment_proof_instructions: settings?.payment_proof_instructions || "",
  }));
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!settings?.id) return;
    setForm({
      payment_mode: settings.payment_mode || plan?.payment_mode || "own_payments",
      accepted_payment_methods: settings.accepted_payment_methods || [],
      payment_instructions: settings.payment_instructions || "",
      payment_link: settings.payment_link || "",
      zelle_note: settings.zelle_note || "",
      cash_app_note: settings.cash_app_note || "",
      venmo_note: settings.venmo_note || "",
      manual_invoice_note: settings.manual_invoice_note || "",
      deposit_instructions: settings.deposit_instructions || "",
      late_fee_policy: settings.late_fee_policy || "",
      cancellation_policy: settings.cancellation_policy || "",
      booking_confirmation_mode: settings.booking_confirmation_mode || "manual_host_approval",
      manual_payment_proof_required: settings.manual_payment_proof_required || false,
      payment_proof_instructions: settings.payment_proof_instructions || "",
    });
  }, [settings?.id]); // eslint-disable-line

  const urideActive = !!settings?.uride_payments_enabled;
  const currentModeLabel = urideActive
    ? "uRideHub Payments Active"
    : form.payment_mode === "uride_payments"
      ? "uRideHub Payments: Off"
      : form.payment_mode === "hybrid"
        ? "Hybrid / Own Payments Active"
        : "Own Payment System Active";

  const toggleMethod = (method) => {
    setForm(prev => ({
      ...prev,
      accepted_payment_methods: prev.accepted_payment_methods.includes(method)
        ? prev.accepted_payment_methods.filter(item => item !== method)
        : [...prev.accepted_payment_methods, method]
    }));
  };

  const confirmationLabel = useMemo(() => ({
    auto_confirm: "Auto-confirm after request",
    manual_host_approval: "Require manual host approval",
    payment_proof_required: "Require proof of payment"
  }[form.booking_confirmation_mode] || "Require manual host approval"), [form.booking_confirmation_mode]);

  return (
    <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-black text-gray-900 text-lg">Payment Setup</h2>
          <p className="text-sm text-gray-500 mt-1">Configure how customers pay you. Package tools stay separate from payment routing.</p>
        </div>
        <Badge className={urideActive ? "bg-emerald-500 text-white" : "bg-gray-900 text-white"}>{currentModeLabel}</Badge>
      </div>

      <div className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${urideActive ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
        <div>
          <p className="text-sm font-black text-gray-900">uRideHub Payments: {urideActive ? "Active" : "Not connected"}</p>
          <p className="text-xs text-gray-500 mt-1">{urideActive ? "Stripe checkout and automatic payouts are live." : "Connect your bank on the Payouts page to activate automatic checkout and payouts — no separate enable step needed."}</p>
        </div>
        {!urideActive && (
          <Link to="/host/payouts" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 whitespace-nowrap">
            <ExternalLink className="h-4 w-4" /> Go to Payouts
          </Link>
        )}
      </div>

      {!urideActive && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Payment mode</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                ["own_payments", "Own payments"],
                ["hybrid", "Hybrid later"]
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setForm(prev => ({ ...prev, payment_mode: value }))} className={`p-3 rounded-xl border text-sm font-bold ${form.payment_mode === value ? "border-pink-300 bg-pink-50 text-pink-700" : "border-gray-100 bg-white text-gray-600"}`}>{label}</button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Accepted methods</p>
            <div className="flex flex-wrap gap-2">
              {METHOD_OPTIONS.map(method => (
                <button key={method} type="button" onClick={() => toggleMethod(method)} className={`px-3 py-2 rounded-full border text-xs font-bold ${form.accepted_payment_methods.includes(method) ? "border-pink-300 bg-pink-50 text-pink-700" : "border-gray-100 bg-white text-gray-500"}`}>{method}</button>
              ))}
            </div>
          </div>

          <Textarea value={form.payment_instructions} onChange={e => setForm(prev => ({ ...prev, payment_instructions: e.target.value }))} placeholder="Payment instructions shown to customers" className="rounded-2xl bg-white text-gray-900" />
          <Input value={form.payment_link} onChange={e => setForm(prev => ({ ...prev, payment_link: e.target.value }))} placeholder="Payment link (optional)" className="rounded-2xl bg-white text-gray-900" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={form.zelle_note} onChange={e => setForm(prev => ({ ...prev, zelle_note: e.target.value }))} placeholder="Zelle note" className="rounded-2xl bg-white text-gray-900" />
            <Input value={form.cash_app_note} onChange={e => setForm(prev => ({ ...prev, cash_app_note: e.target.value }))} placeholder="Cash App note" className="rounded-2xl bg-white text-gray-900" />
            <Input value={form.venmo_note} onChange={e => setForm(prev => ({ ...prev, venmo_note: e.target.value }))} placeholder="Venmo note" className="rounded-2xl bg-white text-gray-900" />
            <Input value={form.manual_invoice_note} onChange={e => setForm(prev => ({ ...prev, manual_invoice_note: e.target.value }))} placeholder="Manual invoice note" className="rounded-2xl bg-white text-gray-900" />
          </div>

          <Textarea value={form.deposit_instructions} onChange={e => setForm(prev => ({ ...prev, deposit_instructions: e.target.value }))} placeholder="Deposit instructions" className="rounded-2xl bg-white text-gray-900" />
          <Textarea value={form.late_fee_policy} onChange={e => setForm(prev => ({ ...prev, late_fee_policy: e.target.value }))} placeholder="Late fee policy" className="rounded-2xl bg-white text-gray-900" />
          <Textarea value={form.cancellation_policy} onChange={e => setForm(prev => ({ ...prev, cancellation_policy: e.target.value }))} placeholder="Cancellation/payment policy" className="rounded-2xl bg-white text-gray-900" />

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Booking confirmation rule</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                ["auto_confirm", "Auto-confirm"],
                ["manual_host_approval", "Manual approval"],
                ["payment_proof_required", "Proof required"]
              ].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setForm(prev => ({ ...prev, booking_confirmation_mode: value, manual_payment_proof_required: value === "payment_proof_required" }))} className={`p-3 rounded-xl border text-sm font-bold ${form.booking_confirmation_mode === value ? "border-pink-300 bg-pink-50 text-pink-700" : "border-gray-100 bg-white text-gray-600"}`}>{label}</button>
              ))}
            </div>
          </div>

          {form.booking_confirmation_mode === "payment_proof_required" && (
            <Textarea value={form.payment_proof_instructions} onChange={e => setForm(prev => ({ ...prev, payment_proof_instructions: e.target.value }))} placeholder="Tell customers how to send proof of payment" className="rounded-2xl bg-white text-gray-900" />
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={() => onSave(form)} disabled={saving} className="flex-1 rounded-xl bg-gray-900 hover:bg-gray-800 text-white"><Save className="h-4 w-4" /> {saving ? "Saving…" : "Save Payment Setup"}</Button>
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(!previewOpen)} className="rounded-xl"><Eye className="h-4 w-4" /> Preview</Button>
          </div>

          {previewOpen && (
            <div className="rounded-2xl border border-pink-100 bg-pink-50 p-4 text-sm text-gray-700 space-y-2">
              <p className="font-black text-gray-900 flex items-center gap-2"><CreditCard className="h-4 w-4 text-pink-600" /> Customer payment preview</p>
              <p>{form.payment_instructions || "Your payment instructions will appear here."}</p>
              {form.payment_link && <p className="font-bold text-pink-700">Payment link: {form.payment_link}</p>}
              <p className="text-xs text-gray-500">Confirmation rule: {confirmationLabel}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}