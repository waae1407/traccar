import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Plus, Edit2, ToggleLeft, ToggleRight, Check, X, Globe, Mail, Phone, CreditCard } from "lucide-react";

const PLAN_COLORS = {
  starter: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  growth: "bg-purple-500/15 text-purple-300 border-purple-500/25",
  enterprise: "bg-yellow-500/15 text-yellow-300 border-yellow-500/25",
};
const STATUS_COLORS = {
  active: "bg-green-500/15 text-green-300 border-green-500/25",
  trialing: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  past_due: "bg-orange-500/15 text-orange-300 border-orange-500/25",
  suspended: "bg-red-500/15 text-red-300 border-red-500/25",
  cancelled: "bg-white/5 text-white/40 border-white/10",
};

function CompanyFormModal({ company, onClose, onSaved }) {
  const [form, setForm] = useState(company || {
    company_name: "", display_name: "", slug: "", support_email: "", support_phone: "",
    primary_color: "#e91e8c", secondary_color: "#7c3aed",
    subscription_plan: "starter", subscription_status: "trialing",
    max_seats: 5, max_vehicles: 20, max_monthly_bookings: 100, is_active: true,
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (data) => company?.id
      ? base44.entities.Company.update(company.id, data)
      : base44.entities.Company.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-companies"] });
      onSaved?.();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl"
        style={{ background: "hsl(222 28% 10%)" }}>
        <div className="flex items-center justify-between p-6 border-b border-white/[0.07]">
          <h2 className="font-bold text-white text-lg">{company ? "Edit Company" : "New Company"}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/10 transition-colors">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Company Name *">
              <Input value={form.company_name} onChange={v => set("company_name", v)} placeholder="Acme Rentals" />
            </Field>
            <Field label="Display Name">
              <Input value={form.display_name} onChange={v => set("display_name", v)} placeholder="Acme" />
            </Field>
            <Field label="Slug *">
              <Input value={form.slug} onChange={v => set("slug", v.toLowerCase().replace(/\s+/g, "-"))} placeholder="acme-rentals" />
            </Field>
            <Field label="Support Email">
              <Input value={form.support_email} onChange={v => set("support_email", v)} placeholder="support@acme.com" />
            </Field>
            <Field label="Support Phone">
              <Input value={form.support_phone} onChange={v => set("support_phone", v)} placeholder="+1 (555) 000-0000" />
            </Field>
            <Field label="Website">
              <Input value={form.website} onChange={v => set("website", v)} placeholder="https://acme.com" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Primary Color">
              <div className="flex items-center gap-3 h-10 px-3 rounded-xl border border-white/[0.12] bg-white/[0.04]">
                <input type="color" value={form.primary_color || "#e91e8c"} onChange={e => set("primary_color", e.target.value)} className="h-6 w-6 rounded cursor-pointer bg-transparent border-0" />
                <span className="text-white/60 text-sm font-mono">{form.primary_color}</span>
              </div>
            </Field>
            <Field label="Secondary Color">
              <div className="flex items-center gap-3 h-10 px-3 rounded-xl border border-white/[0.12] bg-white/[0.04]">
                <input type="color" value={form.secondary_color || "#7c3aed"} onChange={e => set("secondary_color", e.target.value)} className="h-6 w-6 rounded cursor-pointer bg-transparent border-0" />
                <span className="text-white/60 text-sm font-mono">{form.secondary_color}</span>
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Plan">
              <select className="w-full h-10 px-3 rounded-xl border border-white/[0.12] bg-white/[0.04] text-white text-sm focus:outline-none focus:border-primary/50"
                value={form.subscription_plan} onChange={e => set("subscription_plan", e.target.value)}>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="w-full h-10 px-3 rounded-xl border border-white/[0.12] bg-white/[0.04] text-white text-sm focus:outline-none focus:border-primary/50"
                value={form.subscription_status} onChange={e => set("subscription_status", e.target.value)}>
                <option value="trialing">Trialing</option>
                <option value="active">Active</option>
                <option value="past_due">Past Due</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
            <Field label="Max Seats">
              <Input type="number" value={form.max_seats} onChange={v => set("max_seats", Number(v))} />
            </Field>
            <Field label="Max Vehicles">
              <Input type="number" value={form.max_vehicles} onChange={v => set("max_vehicles", Number(v))} />
            </Field>
            <Field label="Max Monthly Bookings">
              <Input type="number" value={form.max_monthly_bookings} onChange={v => set("max_monthly_bookings", Number(v))} />
            </Field>
            <Field label="Trial Ends">
              <Input type="date" value={form.trial_ends_at} onChange={v => set("trial_ends_at", v)} />
            </Field>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => set("is_active", !form.is_active)} className="flex items-center gap-2 text-sm text-white/70">
              {form.is_active
                ? <ToggleRight className="h-5 w-5 text-green-400" />
                : <ToggleLeft className="h-5 w-5 text-white/30" />}
              Company Active
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-white/[0.07]">
          <button onClick={onClose} className="px-5 py-2 rounded-xl text-sm font-semibold text-white/60 border border-white/10 hover:bg-white/[0.06] transition-colors">Cancel</button>
          <button
            onClick={() => saveMutation.mutate(form)}
            disabled={!form.company_name || !form.slug || saveMutation.isPending}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            {saveMutation.isPending ? "Saving…" : company ? "Save Changes" : "Create Company"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      className="w-full h-10 px-3 rounded-xl border border-white/[0.12] bg-white/[0.04] text-white text-sm placeholder-white/25 focus:outline-none focus:border-primary/50 transition-colors"
      value={value || ""}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

export default function CompanyManagement() {
  const [modal, setModal] = useState(null); // null | "new" | company object
  const queryClient = useQueryClient();

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["all-companies"],
    queryFn: () => base44.entities.Company.list("-created_date", 100),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.Company.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["all-companies"] }),
  });

  return (
    <div className="animate-fade-in-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne font-bold text-white text-2xl">Companies</h1>
          <p className="text-white/35 text-sm mt-0.5">{companies.length} tenant{companies.length !== 1 ? "s" : ""} on the platform</p>
        </div>
        <button
          onClick={() => setModal("new")}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <Plus className="h-4 w-4" /> New Company
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : companies.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.07] p-16 text-center" style={{ background: "hsl(222 24% 10% / 0.8)" }}>
          <Building2 className="h-10 w-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/40 text-sm">No companies yet. Create your first tenant.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: "hsl(222 24% 10% / 0.9)", boxShadow: "0 4px 32px hsl(222 28% 5% / 0.5)" }}>
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]" style={{ background: "hsl(222 28% 8% / 0.8)" }}>
                {["Company", "Slug", "Plan", "Status", "Seats", "Vehicles", "Active", ""].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-white/35">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.map(c => (
                <tr key={c.id} className="border-b border-white/[0.04] last:border-0 hover:bg-primary/[0.04] transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                        style={{ background: `linear-gradient(135deg, ${c.primary_color || "#e91e8c"}, ${c.secondary_color || "#7c3aed"})` }}>
                        {(c.display_name || c.company_name).charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{c.display_name || c.company_name}</p>
                        <p className="text-xs text-white/35">{c.support_email || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-mono text-xs text-white/50 bg-white/[0.04] px-2 py-1 rounded-lg">{c.slug}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize ${PLAN_COLORS[c.subscription_plan] || "bg-white/5 text-white/40 border-white/10"}`}>
                      {c.subscription_plan}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize ${STATUS_COLORS[c.subscription_status] || "bg-white/5 text-white/40 border-white/10"}`}>
                      {c.subscription_status?.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-white/50 text-sm">{c.active_seat_count || 0}/{c.max_seats || "∞"}</td>
                  <td className="px-4 py-3.5 text-white/50 text-sm">{c.max_vehicles || "∞"}</td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => toggleMutation.mutate({ id: c.id, is_active: !c.is_active })}>
                      {c.is_active !== false
                        ? <ToggleRight className="h-5 w-5 text-green-400" />
                        : <ToggleLeft className="h-5 w-5 text-white/25" />}
                    </button>
                  </td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => setModal(c)} className="h-8 w-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center transition-colors">
                      <Edit2 className="h-3.5 w-3.5 text-white/50" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <CompanyFormModal
          company={modal === "new" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => setModal(null)}
        />
      )}
    </div>
  );
}