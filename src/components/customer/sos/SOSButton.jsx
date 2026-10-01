import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import SOSSetupSheet from "./SOSSetupSheet";
import SOSConfirmSheet from "./SOSConfirmSheet";

/**
 * SOSButton — Emergency button for the My Vehicle page.
 *
 * - Default: floating, bottom-right, above the bottom nav
 * - inline: positioned by parent container (circular red button)
 * - variant="pill": pill-shaped button with gold outline + bell icon
 *
 * Tap → checks for emergency contact
 *   - No contact → shows SOSSetupSheet
 *   - Contact exists → shows SOSConfirmSheet (hold-to-confirm trigger)
 * Only visible when there's an active booking (not demo mode)
 */
export default function SOSButton({ booking, device, inline = false, variant = "circular" }) {
  const { user } = useAuth();
  const [sheet, setSheet] = useState(null);

  const { data: contacts = [], refetch } = useQuery({
    queryKey: ["sos-emergency-contacts", user?.id],
    queryFn: () => base44.entities.GPSEmergencyContact.filter({ customer_user_id: user.id }),
    enabled: !!user?.id,
  });

  if (!booking) return null;

  const primaryContact = contacts.find((c) => c.is_primary) || contacts[0];

  const handleTap = () => {
    if (primaryContact) {
      setSheet("confirm");
    } else {
      setSheet("setup");
    }
  };

  const isPill = variant === "pill";

  const buttonStyle = isPill
    ? {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        height: 56,
        borderRadius: 999,
        background: "rgba(20,20,20,0.55)",
        border: "2px solid rgba(212,175,55,0.75)",
        boxShadow: "0 0 14px rgba(212,175,55,0.25)",
        color: "#FF5A50",
        fontSize: 20,
        fontWeight: 700,
        letterSpacing: "0.03em",
        cursor: "pointer",
        width: "100%",
      }
    : inline
    ? {
        height: 58,
        width: 58,
        padding: 0,
        borderRadius: "50%",
        background: "radial-gradient(circle at 35% 30%, #FF6B5E, #E0271B 60%, #A50F08)",
        border: "2px solid rgba(255,255,255,0.3)",
        boxShadow: "0 0 28px rgba(255,59,48,0.7), 0 4px 16px rgba(127,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }
    : {
        position: "fixed",
        top: 290,
        right: 20,
        zIndex: 60,
        height: 52,
        width: 52,
        padding: 0,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #B71C1C, #7F0000)",
        border: "2px solid rgba(255,255,255,0.18)",
        boxShadow: "0 8px 24px rgba(127,0,0,0.5), 0 0 20px rgba(183,28,28,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.2s ease",
        animation: "pulse-glow 2.5s ease-in-out infinite",
      };

  return (
    <>
      <button
        onClick={handleTap}
        style={buttonStyle}
        className="control-tap"
        aria-label="Emergency SOS"
      >
        {isPill ? (
          <span>PANIC/SOS</span>
        ) : (
          <span
            style={{
              fontSize: inline ? 15 : 17,
              fontWeight: 800,
              color: "#FFF",
              letterSpacing: "0.08em",
              textShadow: "0 1px 4px rgba(0,0,0,0.3)",
            }}
          >
            SOS
          </span>
        )}
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