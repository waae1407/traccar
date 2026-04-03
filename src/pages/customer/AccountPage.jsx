import React, { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
import { User, Phone, Mail, LogOut, ChevronRight, Shield, CreditCard, HelpCircle, Bell, Check, X, Save, Upload } from "lucide-react";

// ── Personal Info Edit Sheet ─────────────────────────────────────────────────
function PersonalInfoSheet({ user, onClose }) {
  const [form, setForm] = useState({
    full_name: user.full_name || "",
    phone: user.phone || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-lg">Personal Info</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Full Name</label>
            <input className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all"
              value={form.full_name} onChange={(e) => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Your full name" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Phone Number</label>
            <input className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all"
              value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 000-0000" type="tel" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Email</label>
            <input className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-400 bg-gray-50 cursor-not-allowed rounded-xl"
              value={user.email} disabled />
            <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="w-full mt-5 h-12 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-70"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {saved ? <><Check className="h-4 w-4" /> Saved!</> : saving ? "Saving…" : <><Save className="h-4 w-4" /> Save Changes</>}
        </button>
      </div>
    </div>
  );
}

// ── ID Verification Sheet ────────────────────────────────────────────────────
function IDVerificationSheet({ user, onClose }) {
  const [uploads, setUploads] = useState({
    license_front: user.driver_license_url || "",
    selfie: user.id_upload_url || "",
  });
  const [uploading, setUploading] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleUpload = async (field, file) => {
    if (!file) return;
    setUploading(p => ({ ...p, [field]: true }));
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setUploads(p => ({ ...p, [field]: file_url }));
    setUploading(p => ({ ...p, [field]: false }));
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({
      driver_license_url: uploads.license_front,
      id_upload_url: uploads.selfie,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 800);
  };

  const UploadBox = ({ field, label }) => (
    <div className={`relative border-2 border-dashed rounded-2xl p-4 transition-colors ${uploads[field] ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
      <input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
        onChange={(e) => handleUpload(field, e.target.files[0])} />
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${uploads[field] ? "bg-green-100" : "bg-white border border-gray-200"}`}>
          {uploads[field] ? <Check className="h-5 w-5 text-green-600" /> : <Upload className="h-5 w-5 text-gray-400" />}
        </div>
        <div>
          <p className="font-semibold text-gray-800 text-sm">{label}</p>
          <p className="text-xs text-gray-400">{uploading[field] ? "Uploading…" : uploads[field] ? "Uploaded ✓" : "Tap to upload or take photo"}</p>
        </div>
      </div>
      {uploads[field] && <img src={uploads[field]} alt="" className="mt-3 h-20 w-full object-cover rounded-xl" />}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-lg">ID Verification</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-4">Upload your driver's license and a selfie so we can verify your identity before your rental.</p>
        <div className="space-y-3">
          <UploadBox field="license_front" label="Driver's License (Front)" />
          <UploadBox field="selfie" label="Live Selfie" />
        </div>
        <button
          onClick={handleSave}
          disabled={saving || saved || (!uploads.license_front && !uploads.selfie)}
          className="w-full mt-5 h-12 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {saved ? <><Check className="h-4 w-4" /> Saved!</> : saving ? "Saving…" : <><Save className="h-4 w-4" /> Save Documents</>}
        </button>
      </div>
    </div>
  );
}

// ── Main AccountPage ─────────────────────────────────────────────────────────
export default function AccountPage() {
  const { user } = useOutletContext() || {};
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null); // "personal" | null

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center mb-6">
          <User className="h-9 w-9 text-gray-400" />
        </div>
        <h3 className="font-bold text-gray-900 text-xl">Sign in to uRide</h3>
        <p className="text-gray-400 text-sm mt-2 max-w-xs">Access your bookings, manage your account, and track your payments.</p>
        <button onClick={() => base44.auth.redirectToLogin(window.location.href)}
          className="mt-6 w-full max-w-xs h-12 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Sign In / Create Account
        </button>
      </div>
    );
  }

  const menuSections = [
    {
      title: "Profile",
      items: [
        { icon: User, label: "Personal Info", sub: user.full_name || "Update your details", onClick: () => setSheet("personal") },
        { icon: Phone, label: "Phone Number", sub: user.phone || "Add phone number", onClick: () => setSheet("personal") },
        { icon: Mail, label: "Email", sub: user.email || "—", onClick: () => setSheet("personal") },
      ],
    },
    {
      title: "Rental",
      items: [
        {
          icon: Shield,
          label: "ID Verification",
          sub: user.driver_license_url ? "Verified ✓" : "Upload required",
          badge: !user.driver_license_url ? "Action" : null,
          onClick: () => setSheet("id-verification"),
        },
        {
          icon: CreditCard,
          label: "Payment Methods",
          sub: "Manage saved cards",
          onClick: () => navigate("/my-bookings"),
        },
      ],
    },
    {
      title: "Support",
      items: [
        {
          icon: HelpCircle,
          label: "Help Center",
          sub: "FAQs and support",
          onClick: () => window.open("mailto:support@uridehub.com", "_blank"),
        },
        {
          icon: Bell,
          label: "Notifications",
          sub: "Manage alerts",
          onClick: () => navigate("/activity"),
        },
      ],
    },
  ];

  return (
    <div className="py-5">
      {/* Profile header */}
      <div className="px-4 mb-6">
        <div className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              {user.full_name?.charAt(0) || "U"}
            </div>
            {user.driver_license_url && (
              <div className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center">
                <Check className="h-2.5 w-2.5 text-white" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-lg leading-tight">{user.full_name || "Customer"}</p>
            <p className="text-sm text-gray-500 truncate">{user.email}</p>
            <span className="inline-block mt-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-pink-50 text-pink-600 border border-pink-100">
              {user.role === "admin" ? "Admin" : "Customer"}
            </span>
          </div>
        </div>
      </div>

      {/* Menu sections */}
      {menuSections.map((section) => (
        <div key={section.title} className="mb-4 px-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{section.title}</p>
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            {section.items.map((item, idx) => (
              <button
                key={item.label}
                onClick={item.onClick}
                className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${idx < section.items.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="h-8 w-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <item.icon className="h-4 w-4 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                  <p className="text-xs text-gray-400 truncate">{item.sub}</p>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex-shrink-0">{item.badge}</span>
                )}
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Sign out */}
      <div className="px-4 mt-2">
        <button
          onClick={() => base44.auth.logout()}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-200 text-red-500 font-semibold text-sm hover:bg-red-50 transition-colors">
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>

      <div className="h-4" />

      {/* Sheets */}
      {sheet === "personal" && <PersonalInfoSheet user={user} onClose={() => setSheet(null)} />}
      {sheet === "id-verification" && <IDVerificationSheet user={user} onClose={() => setSheet(null)} />}
    </div>
  );
}