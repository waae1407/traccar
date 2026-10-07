import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { X, ScanLine, Loader2, CheckCircle2, AlertCircle, Car, Plus } from "lucide-react";

/**
 * AddPrivateVehicleSheet — Bottom sheet for private GPS owners to add a
 * vehicle to their map by entering the VIN. Links with the installed device
 * and activates controls if the install is completed.
 */
export default function AddPrivateVehicleSheet({ onClose, onAdded }) {
  const queryClient = useQueryClient();
  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    const cleanVin = vin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cleanVin.length < 11) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke("addPrivateVehicle", { vin: cleanVin });
      setResult(res.data);
      if (res.data?.ok) {
        // Invalidate fleet map queries so the new vehicle appears
        await queryClient.invalidateQueries({ queryKey: ["host-fleetmap-vehicles"] });
        await queryClient.invalidateQueries({ queryKey: ["host-fleetmap-devices"] });
        onAdded?.(res.data);
      }
    } catch (e) {
      setResult({ ok: false, error: e?.response?.data?.error || e.message });
    } finally {
      setLoading(false);
    }
  };

  const cleanVin = vin.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 90 }} onClick={onClose} />
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430, background: "#17181C",
        borderTop: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px 20px 0 0",
        padding: "20px 16px 28px", zIndex: 91, maxHeight: "85vh", overflowY: "auto",
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 16px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg, rgba(233,30,140,0.2), rgba(123,97,255,0.15))", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Car size={18} color="#E91E8C" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#F5F5F7", margin: 0 }}>Add Vehicle to Map</h2>
              <p style={{ fontSize: 12, color: "#8E8E93", margin: 0 }}>Enter your VIN to link your installed GPS</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} color="#8E8E93" />
          </button>
        </div>

        {/* Result state */}
        {result?.ok ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircle2 size={48} color="#50C878" style={{ margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#F5F5F7", margin: "0 0 6px" }}>
              {result.went_live ? "Vehicle Live!" : "Vehicle Added!"}
            </h3>
            <p style={{ fontSize: 13, color: "#8E8E93", margin: "0 0 20px", lineHeight: 1.5 }}>
              {result.message}
            </p>
            <button onClick={onClose} style={{
              width: "100%", height: 48, borderRadius: 14, background: "#50C878",
              color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}>
              Done
            </button>
          </div>
        ) : (
          <>
            {/* VIN input */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
                Vehicle Identification Number (VIN)
              </label>
              <input
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))}
                placeholder="Enter 17-character VIN"
                autoFocus
                style={{
                  width: "100%", height: 52, borderRadius: 14, background: "#0A0A0A",
                  border: `1px solid ${cleanVin.length >= 11 ? "rgba(80,200,120,0.3)" : "rgba(255,255,255,0.1)"}`,
                  color: "#F5F5F7", fontSize: 16, padding: "0 16px", outline: "none",
                  fontFamily: "monospace", letterSpacing: 1.5, textAlign: "center",
                }}
                onKeyDown={(e) => e.key === "Enter" && cleanVin.length >= 11 && !loading && handleSubmit()}
              />
              <p style={{ fontSize: 11, color: "#48484A", marginTop: 6, textAlign: "center" }}>
                {cleanVin.length}/17 characters
              </p>
            </div>

            {/* Info */}
            <div style={{
              display: "flex", gap: 8, padding: "10px 12px", borderRadius: 12,
              background: "rgba(47,128,255,0.08)", border: "1px solid rgba(47,128,255,0.15)", marginBottom: 16,
            }}>
              <AlertCircle size={14} color="#2F80FF" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 11, color: "#8AB4F8", lineHeight: 1.5, margin: 0 }}>
                Use the same VIN your installer entered during installation. This links your GPS device to your vehicle and activates remote controls.
              </p>
            </div>

            {/* Error */}
            {result?.error && (
              <div style={{
                padding: "10px 12px", borderRadius: 12, marginBottom: 12,
                background: "rgba(255,69,58,0.1)", border: "1px solid rgba(255,69,58,0.2)",
              }}>
                <p style={{ fontSize: 12, color: "#FF6961", margin: 0 }}>{result.error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={cleanVin.length < 11 || loading}
              style={{
                width: "100%", height: 52, borderRadius: 14,
                background: cleanVin.length >= 11 && !loading
                  ? "linear-gradient(135deg, #E91E8C, #7B61FF)"
                  : "#1C1C1E",
                color: cleanVin.length >= 11 && !loading ? "#fff" : "#48484A",
                border: "none", fontWeight: 700, fontSize: 15, cursor: cleanVin.length >= 11 && !loading ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <><Plus size={18} /> Add Vehicle</>}
            </button>
          </>
        )}
      </div>
    </>
  );
}