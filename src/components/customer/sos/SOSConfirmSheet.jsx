import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { X, Siren, Phone, Mail, MapPin, MessageSquare, CheckCircle, AlertTriangle } from "lucide-react";

/**
 * SOSConfirmSheet — Shown when an emergency contact exists.
 * Hold-to-confirm triggers the SOS (SMS + voice call + email + location share).
 */
export default function SOSConfirmSheet({ contact, booking, device, onClose, onTriggered }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const holdInterval = useRef(null);

  const vehicleName = booking?.vehicle_name || "your vehicle";
  const lat = device?.last_latitude;
  const lon = device?.last_longitude;
  const hasLocation = lat != null && lon != null;

  const startHold = () => {
    if (sending) return;
    setHolding(true);
    let elapsed = 0;
    const duration = 3000;
    holdInterval.current = setInterval(() => {
      elapsed += 50;
      setProgress(Math.min(100, (elapsed / duration) * 100));
      if (elapsed >= duration) {
        clearInterval(holdInterval.current);
        holdInterval.current = null;
        setHolding(false);
        setProgress(0);
        triggerSOS();
      }
    }, 50);
  };

  const cancelHold = () => {
    if (holdInterval.current) {
      clearInterval(holdInterval.current);
      holdInterval.current = null;
    }
    setHolding(false);
    setProgress(0);
  };

  const triggerSOS = async () => {
    setSending(true);
    try {
      const res = await base44.functions.invoke("sendRentalSOS", {
        booking_id: booking?.id,
        device_id: device?.id,
      });
      setResult({ success: true, ...res });
      onTriggered?.(res);
    } catch (err) {
      setResult({ success: false, error: err.message || "Failed to send SOS" });
    } finally {
      setSending(false);
    }
  };

  if (result) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} onClick={onClose} />
        <div style={{
          position: "relative", background: "#0E0F13", borderTop: "1px solid rgba(255,255,255,0.1)",
          borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "32px 20px",
          animation: "fade-in-up 0.3s ease-out",
        }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            {result.success ? (
              <>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(48,209,88,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <CheckCircle size={32} color="#30D158" />
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: "#FFF", margin: "0 0 8px" }}>SOS Sent</h3>
                <p style={{ fontSize: 14, color: "#A1A1AA", lineHeight: 1.5, margin: 0 }}>
                  Emergency alert sent to <span style={{ color: "#F5F5F7", fontWeight: 600 }}>{contact.contact_name}</span>.
                </p>
              </>
            ) : (
              <>
                <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(255,69,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <AlertTriangle size={32} color="#FF453A" />
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: "#FFF", margin: "0 0 8px" }}>SOS Failed</h3>
                <p style={{ fontSize: 14, color: "#FF453A", lineHeight: 1.5, margin: 0 }}>{result.error}</p>
              </>
            )}
          </div>

          {result.success && (
            <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <ResultRow icon={<MessageSquare size={16} color={result.sms_sent ? "#30D158" : "#71717A"} />} label="Text Message" value={result.sms_sent ? "Sent" : "Failed"} ok={result.sms_sent} />
                <ResultRow icon={<Phone size={16} color={result.call_sent ? "#30D158" : "#71717A"} />} label="Voice Call" value={result.call_sent ? "Sent" : "Failed"} ok={result.call_sent} />
                {contact.contact_email && (
                  <ResultRow icon={<Mail size={16} color={result.email_sent ? "#30D158" : "#71717A"} />} label="Email" value={result.email_sent ? "Sent" : "Failed"} ok={result.email_sent} />
                )}
                <ResultRow icon={<MapPin size={16} color={hasLocation ? "#89B4F8" : "#71717A"} />} label="Location" value={hasLocation ? "Shared" : "Unavailable"} ok={hasLocation} />
              </div>
            </div>
          )}

          {result.success && hasLocation && (
            <a
              href={`https://www.google.com/maps?q=${lat},${lon}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                width: "100%", padding: "14px", borderRadius: 14,
                background: "rgba(47,128,255,0.1)", border: "1px solid rgba(47,128,255,0.2)",
                color: "#89B4F8", fontSize: 14, fontWeight: 600, textDecoration: "none",
                marginBottom: 12, cursor: "pointer",
              }}
            >
              <MapPin size={16} color="#89B4F8" />
              View Vehicle Location
            </a>
          )}

          <button
            onClick={onClose}
            style={{
              width: "100%", padding: "16px", borderRadius: 18,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              color: "#F5F5F7", fontSize: 15, fontWeight: 600, cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }} onClick={onClose} />
      <div style={{
        position: "relative", background: "#0E0F13", borderTop: "1px solid rgba(255,69,58,0.2)",
        borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: "24px 20px 32px",
        animation: "fade-in-up 0.3s ease-out",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,69,58,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Siren size={20} color="#FF453A" />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#FFF", margin: 0 }}>Emergency SOS</h3>
              <p style={{ fontSize: 12, color: "#A1A1AA", margin: "2px 0 0" }}>Hold the button to trigger</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={16} color="#FFF" />
          </button>
        </div>

        {/* Contact preview */}
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 16, marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "#71717A", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" }}>Will Notify</p>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: "linear-gradient(135deg, #FF453A, #FF6B5A)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#FFF", fontSize: 16 }}>
              {contact.contact_name?.charAt(0) || "?"}
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#F5F5F7", margin: 0 }}>{contact.contact_name}</p>
              <p style={{ fontSize: 13, color: "#A1A1AA", margin: "2px 0 0" }}>{contact.contact_phone}</p>
              {contact.relationship && <p style={{ fontSize: 11, color: "#71717A", margin: "2px 0 0" }}>{contact.relationship}</p>}
            </div>
          </div>
        </div>

        {/* What will happen */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          <ActionRow icon={<MessageSquare size={15} color="#30D158" />} text={`Text with location sent to ${contact.contact_name}`} />
          <ActionRow icon={<Phone size={15} color="#30D158" />} text={`Automated voice call to ${contact.contact_phone}`} />
          {contact.contact_email && contact.receive_email && (
            <ActionRow icon={<Mail size={15} color="#89B4F8" />} text={`Email with map link to ${contact.contact_email}`} />
          )}
          <ActionRow icon={<MapPin size={15} color="#89B4F8" />} text={`Vehicle location: ${hasLocation ? "Available" : "Acquiring…"}`} />
        </div>

        {/* Hold-to-confirm button */}
        <button
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          disabled={sending}
          style={{
            position: "relative", width: "100%", padding: "24px", borderRadius: 22,
            background: sending ? "rgba(255,69,58,0.3)" : "linear-gradient(135deg, #FF453A, #E03830)",
            border: "none", color: "#FFF", fontSize: 16, fontWeight: 700, cursor: sending ? "not-allowed" : "pointer",
            overflow: "hidden", transition: "all 0.2s",
            boxShadow: holding ? "0 0 40px rgba(255,69,58,0.5)" : "0 0 16px rgba(255,69,58,0.2)",
          }}
        >
          {holding && (
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0,
              width: `${progress}%`, background: "rgba(255,255,255,0.15)", transition: "width 0.05s linear",
            }} />
          )}
          <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <Siren size={28} color="#FFF" className={sending ? "animate-pulse" : ""} />
            <p style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
              {sending ? "SENDING SOS…" : holding ? "KEEP HOLDING…" : "HOLD 3s TO TRIGGER"}
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", margin: 0 }}>
              {sending ? "Notifying your emergency contact" : "Releases if you let go"}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

function ResultRow({ icon, label, value, ok }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {icon}
        <span style={{ fontSize: 13, color: "#A1A1AA" }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: ok ? "#30D158" : "#FF453A" }}>{value}</span>
    </div>
  );
}

function ActionRow({ icon, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {icon}
      <span style={{ fontSize: 13, color: "#A1A1AA" }}>{text}</span>
    </div>
  );
}