import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import SOSSetupSheet from "./SOSSetupSheet";
import SOSConfirmSheet from "./SOSConfirmSheet";

/**
 * SOSButton — Floating emergency button for the My Vehicle page.
 *
 * - Floating, bottom-right, above the bottom nav (thumb-reachable)
 * - Tap → checks for emergency contact
 *   - No contact → shows SOSSetupSheet (how it works + contact form)
 *   - Contact exists → shows SOSConfirmSheet (hold-to-confirm trigger)
 * - Only visible when there's an active booking (not demo mode)
 */
export default function SOSButton({ booking, device }) {
  const { user } = useAuth();
  const [sheet, setSheet] = useState(null); // null | "setup" | "confirm"

  const { data: contacts = [], refetch } = useQuery({
    queryKey: ["sos-emergency-contacts", user?.id],
    queryFn: () => base44.entities.GPSEmergencyContact.filter({ customer_user_id: user.id }),
    enabled: !!user?.id,
  });

  // Only show when there's a real active booking
  if (!booking) return null;

  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];

  const handleTap = () => {
    if (primaryContact) {
      setSheet("confirm");
    } else {
      setSheet("setup");
    }
  };

  return (
    <>
      <button
        onClick={handleTap}
        style={{
          position: "fixed",
          bottom: 84,
          right: 20,
          zIndex: 60,
          height: 52,
          padding: "0 20px 0 16px",
          borderRadius: 26,
          background: "linear-gradient(135deg, #FF453A, #E03830)",
          border: "2px solid rgba(255,255,255,0.2)",
          boxShadow: "0 8px 24px rgba(255,69,58,0.45), 0 0 20px rgba(255,69,58,0.25)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          transition: "all 0.2s ease",
          animation: "pulse-glow 2.5s ease-in-out infinite",
        }}
        className="control-tap"
        aria-label="Emergency SOS"
      >
        <span style={{ fontSize: 22, lineHeight: 1 }}>🆘</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#FFF", letterSpacing: "0.05em", textShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>SOS</span>
      </button>

      {sheet === "setup" && (
        <SOSSetupSheet
          onClose={() => setSheet(null)}
          onSaved={() => {
            refetch();
            setSheet(null);
          }}
        />
      )}
      {sheet === "confirm" && primaryContact && (
        <SOSConfirmSheet
          contact={primaryContact}
          booking={booking}
          device={device}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}