import { uploadFile } from "@/utils/uploadFile";
import React, { useState, useEffect } from "react";
import ReferralCard from "@/components/customer/ReferralCard";
import { useOutletContext, useNavigate, useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { User, Phone, Mail, LogOut, ChevronRight, Shield, CreditCard, HelpCircle, Bell, Check, X, Save, Upload } from "lucide-react";

// ── Personal Info Edit Sheet ─────────────────────────────────────────────────
function PersonalInfoSheet({ user, onClose, heroGradient }) {
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
          style={{ background: heroGradient }}>
          {saved ? <><Check className="h-4 w-4" /> Saved!</> : saving ? "Saving…" : <><Save className="h-4 w-4" /> Save Changes</>}
        </button>
      </div>
    </div>
  );
}

// ── ID Verification Sheet ────────────────────────────────────────────────────
function IDVerificationSheet({ user, isVerified, verifiedBooking, onClose, heroGradient }) {
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
    const { file_url } = await uploadFile(file);
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
      <div className="relative w-full max-w-lg mx-auto bg-white rounded-t-3xl p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-gray-900 text-lg">ID Verification</h3>
          <button onClick={onClose} className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        {isVerified ? (
          /* ── Verified view ── */
          <>
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-200 mb-5">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                <Check className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-green-800 text-sm">Identity Verified</p>
                <p className="text-xs text-green-600 mt-0.5">Your documents have been submitted and verified.</p>
              </div>
            </div>
            <div className="space-y-3">
              {(user.driver_license_url || verifiedBooking?.license_front_url) && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Driver's License</p>
                  <img src={user.driver_license_url || verifiedBooking?.license_front_url} alt="Driver's License" className="w-full rounded-2xl object-cover border border-gray-100 shadow-sm" />
                </div>
              )}
              {(user.id_upload_url || verifiedBooking?.selfie_url) && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Selfie</p>
                  <img src={user.id_upload_url || verifiedBooking?.selfie_url} alt="Selfie" className="w-full rounded-2xl object-cover border border-gray-100 shadow-sm" />
                </div>
              )}
            </div>
            <button onClick={onClose} className="w-full mt-5 h-12 rounded-xl font-bold text-sm text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors">
              Close
            </button>
          </>
        ) : (
          /* ── Upload view ── */
          <>
            <p className="text-xs text-gray-400 mb-4">Upload your driver's license and a selfie so we can verify your identity before your rental.</p>
            <div className="space-y-3">
              <UploadBox field="license_front" label="Driver's License (Front)" />
              <UploadBox field="selfie" label="Live Selfie" />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || saved || (!uploads.license_front && !uploads.selfie)}
              className="w-full mt-5 h-12 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ background: heroGradient }}>
              {saved ? <><Check className="h-4 w-4" /> Saved!</> : saving ? "Saving…" : <><Save className="h-4 w-4" /> Save Documents</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main AccountPage ─────────────────────────────────────────────────────────
export default function AccountPage() {
  const { user, brand } = useOutletContext() || {};
  const brandColor = brand?.brand_color || "#e91e8c";
  const secondaryColor = brand?.secondary_color || "#7c3aed";
  const heroGradient = `linear-gradient(135deg, ${brandColor}, ${secondaryColor})`;
  const navigate = useNavigate();
  const { businessSlug } = useParams();
  const bookingsPath = businessSlug ? `/host/${businessSlug}/bookings` : "/my-bookings";
  const activityPath = businessSlug ? `/host/${businessSlug}/activity` : "/activity";
  const [sheet, setSheet] = useState(null);

  useEffect(() => {
    if (window.location.hash === "#rent-for-free") {
      setTimeout(() => {
        const el = document.getElementById("rent-for-free");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, []);

  // Check verification from booking requests (user may have verified during checkout)
  const { data: bookingRequests = [] } = useQuery({
    queryKey: ["my-bookings-verification", user?.email],
    queryFn: async () => {
      const all = await base44.entities.BookingRequest.list("-created_date", 50);
      return all.filter((b) => b.user_email === user.email || b.created_by === user.email);
    },
    enabled: !!user?.email,
  });

  const isVerified = !!user?.driver_license_url ||
    bookingRequests.some((b) => b.verification_status === "verified" && b.license_front_url);

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
          style={{ background: heroGradient }}>
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
          sub: isVerified ? "Identity verified ✓" : "Upload required",
          subColor: isVerified ? "text-green-500" : undefined,
          badge: !isVerified ? "Action" : null,
          onClick: () => setSheet("id-verification"),
        },
        {
          icon: CreditCard,
          label: "Payment Methods",
          sub: "Manage saved cards",
          onClick: () => navigate(bookingsPath),
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
          onClick: () => navigate(activityPath),
        },
      ],
    },
  ];

  return (
    <div className="pb-6">
      {/* Premium Profile Hero */}
      <div className="relative overflow-hidden mb-6" style={{ background: heroGradient }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 80% 20%, rgba(255,255,255,0.15) 0%, transparent 60%)" }} />
        <div className="relative z-10 px-5 pt-8 pb-8">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-18 w-18 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-lg"
                style={{ background: heroGradient, height: 72, width: 72 }}>
                {user.full_name?.charAt(0) || "U"}
              </div>
              {isVerified && (
                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-sm">
                  <Check className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-xl leading-tight" style={{ fontFamily: "var(--font-syne)" }}>{user.full_name || "Customer"}</p>
              <p className="text-white/50 text-xs truncate mt-0.5">{user.email}</p>
              <span className="inline-block mt-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-white/10 text-white/80">
                {user.role === "admin" ? "Admin" : "uRide Member"}
              </span>
            </div>
          </div>
        </div>
        <div className="h-5"><svg viewBox="0 0 375 20" fill="#f8f8fa" className="w-full" preserveAspectRatio="none"><path d="M0 20L375 20L375 5C300 18 180 1 0 12L0 20Z"/></svg></div>
      </div>

      {/* Menu sections */}
      {menuSections.map((section) => (
        <div key={section.title} className="mb-4 px-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">{section.title}</p>
          <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
            {section.items.map((item, idx) => (
              <button
                key={item.label}
                onClick={item.onClick}
                className={`w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left ${idx < section.items.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="h-9 w-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${brandColor}14` }}>
                  <item.icon className="h-4 w-4" style={{ color: brandColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm">{item.label}</p>
                  <p className={`text-xs truncate ${item.subColor || "text-gray-400"}`}>{item.sub}</p>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">{item.badge}</span>
                )}
                <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Referral Card */}
      <div id="rent-for-free" className="px-5 mb-1">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">Rent for Free</p>
      </div>
      <ReferralCard user={user} />

      {/* Sign out */}
      <div className="px-5 mt-4">
        <button
          onClick={() => base44.auth.logout()}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-red-500 font-bold text-sm transition-colors"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>

      <div className="h-4" />

      {/* Sheets */}
      {sheet === "personal" && <PersonalInfoSheet user={user} onClose={() => setSheet(null)} heroGradient={heroGradient} />}
      {sheet === "id-verification" && (
        <IDVerificationSheet
          user={user}
          isVerified={isVerified}
          verifiedBooking={bookingRequests.find((b) => b.verification_status === "verified" && b.license_front_url)}
          onClose={() => setSheet(null)}
          heroGradient={heroGradient}
        />
      )}
    </div>
  );
}