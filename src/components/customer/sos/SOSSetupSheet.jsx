import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { X, Siren, Phone, Mail, MapPin, MessageSquare, Bell, Shield, ChevronRight } from "lucide-react";

/**
 * SOSSetupSheet — Bottom sheet shown when no emergency contact is configured.
 * Explains how SOS works, what to expect, and collects contact details.
 */
export default function SOSSetupSheet({ onClose, onSaved }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    relationship: "",
    receive_sms: true,
    receive_email: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    if (!form.contact_name.trim() || !form.contact_phone.trim()) {
      setError("Please enter at least a contact name and phone number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await base44.entities.GPSEmergencyContact.create({
        customer_user_id: user.id,
        customer_email: user.email,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        contact_email: form.contact_email.trim() || undefined,
        relationship: form.relationship.trim() || undefined,
        is_primary: true,
        receive_sms: form.receive_sms,
        receive_email: form.receive_email,
        receive_push: false,
      });
      onSaved?.();
    } catch (err) {
      setError(err.message || "Failed to save contact.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div style={{
        position: "relative", background: "#0E0F13", borderTop: "1px solid rgba(255,69,58,0.2)",
        borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "24px 20px 32px",
        maxHeight: "90vh", overflowY: "auto", animation: "fade-in-up 0.3s ease-out",
      }} className="no-scrollbar">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,69,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Siren size={20} color="#FF453A" />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#FFF", margin: 0 }}>Set Up SOS</h3>
              <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0" }}>Add an emergency contact to enable SOS</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={16} color="#FFF" />
          </button>
        </div>

        {/* How it works */}
        <div style={{ background: "rgba(255,69,58,0.06)", border: "1px solid rgba(255,69,58,0.15)", borderRadius: 18, padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#FF453A", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>How It Works</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MapPin size={16} color="#89B4F8" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7", margin: 0 }}>Location Shared</p>
                <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0", lineHeight: 1.4 }}>Your vehicle's live GPS location is sent to your emergency contact via text and email.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <MessageSquare size={16} color="#30D158" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7", margin: 0 }}>Text & Call Sent</p>
                <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0", lineHeight: 1.4 }}>An automated text and voice call go out to your contact with your location and a map link.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Shield size={16} color="#FF9F0A" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#F5F5F7", margin: 0 }}>You Stay Informed</p>
                <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0", lineHeight: 1.4 }}>You'll see a confirmation with exactly who was contacted. You can use 911 as the phone number for direct emergency dispatch.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact form */}
        <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 12px" }}>Emergency Contact</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#A1A1AA", marginBottom: 6, display: "block" }}>Contact Name *</label>
            <input
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              placeholder="e.g. Mom, Spouse, 911 Dispatch"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#A1A1AA", marginBottom: 6, display: "block" }}>Phone Number *</label>
            <input
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              placeholder="e.g. +1 555 123 4567 or 911"
              type="tel"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#A1A1AA", marginBottom: 6, display: "block" }}>Email (optional)</label>
            <input
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              placeholder="contact@example.com"
              type="email"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#A1A1AA", marginBottom: 6, display: "block" }}>Relationship (optional)</label>
            <input
              value={form.relationship}
              onChange={(e) => setForm({ ...form, relationship: e.target.value })}
              placeholder="e.g. Spouse, Parent, Friend"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Channel toggles */}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button
            onClick={() => setForm({ ...form, receive_sms: !form.receive_sms })}
            style={channelToggleStyle(form.receive_sms)}
          >
            <MessageSquare size={16} color={form.receive_sms ? "#30D158" : "#71717A"} />
            <span style={{ fontSize: 12, fontWeight: 600, color: form.receive_sms ? "#F5F5F7" : "#71717A" }}>Text</span>
          </button>
          <button
            onClick={() => setForm({ ...form, receive_email: !form.receive_email })}
            style={channelToggleStyle(form.receive_email)}
          >
            <Mail size={16} color={form.receive_email ? "#89B4F8" : "#71717A"} />
            <span style={{ fontSize: 12, fontWeight: 600, color: form.receive_email ? "#F5F5F7" : "#71717A" }}>Email</span>
          </button>
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "#FF453A", marginTop: 12, textAlign: "center" }}>{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            width: "100%", marginTop: 20, padding: "16px", borderRadius: 18,
            background: saving ? "rgba(255,69,58,0.4)" : "linear-gradient(135deg, #FF453A, #FF6B5A)",
            border: "none", color: "#FFF", fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          <Siren size={18} color="#FFF" />
          {saving ? "Saving…" : "Save & Enable SOS"}
        </button>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "14px 16px", borderRadius: 14,
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
  color: "#F5F5F7", fontSize: 14, outline: "none",
};

function channelToggleStyle(active) {
  return {
    flex: 1, padding: "12px", borderRadius: 14,
    background: active ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
    border: active ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.05)",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer",
    transition: "all 0.2s",
  };
}