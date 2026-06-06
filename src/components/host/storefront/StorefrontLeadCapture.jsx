import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Bell, CheckCircle2 } from "lucide-react";

export default function StorefrontLeadCapture({ brand, businessSlug }) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSaving(true);
    await base44.entities.StorefrontLead.create({
      host_id: brand?.host_id || "",
      business_slug: businessSlug,
      email,
      source: "storefront_waitlist",
      status: "new"
    });
    setDone(true);
    setSaving(false);
  };

  return (
    <div className="mx-5 rounded-3xl bg-white border border-gray-100 shadow-sm p-5 text-center">
      <div className="h-14 w-14 rounded-2xl bg-pink-50 flex items-center justify-center mx-auto mb-3">
        {done ? <CheckCircle2 className="h-7 w-7 text-emerald-500" /> : <Bell className="h-7 w-7 text-pink-600" />}
      </div>
      <h3 className="text-xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>
        {done ? "You're on the list" : "No vehicles available yet"}
      </h3>
      <p className="text-sm text-gray-500 mt-1">
        {done ? "We'll notify you when this store adds inventory." : "Notify me when vehicles become available."}
      </p>
      {!done && (
        <form onSubmit={submit} className="mt-4 flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            className="flex-1 rounded-2xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:outline-none focus:border-pink-400"
          />
          <button disabled={saving} className="rounded-2xl bg-pink-600 text-white px-4 py-3 text-sm font-black disabled:opacity-50">
            {saving ? "Saving" : "Notify"}
          </button>
        </form>
      )}
    </div>
  );
}