import React, { useState, useCallback } from "react";
import { X, Bluetooth, BluetoothSearching, Power, Info, RefreshCw, CheckCircle2 } from "lucide-react";

const LABEL_FONT = "'Barlow Condensed', sans-serif";

/**
 * Full-screen Bluetooth setup overlay — mirrors the GeofenceManagerOverlay
 * pattern. Opens from the vehicle action sheet so a host can power on the
 * MT20 Bluetooth module (008) and query the pairing name/password/IMEI (024)
 * without navigating away from the fleet map.
 *
 * Commands flow through the existing sendTelematicsCommand backend function,
 * which routes them through the same Traccar production path (heartbeat gate,
 * rate limiting, MT20 wrapping) as all other Noran commands.
 */
export default function BluetoothSetupOverlay({ vehicle, device, user, onClose }) {
  const [loading, setLoading] = useState(null); // 'power_on' | 'query' | null
  const [results, setResults] = useState({}); // { bluetooth_power_on: {...}, bluetooth_query_pairing: {...} }
  const [error, setError] = useState(null);

  const sendBluetoothCommand = useCallback(async (commandType) => {
    setLoading(commandType);
    setError(null);
    try {
      const { default: TelematicsService } = await import("@/lib/telematics/TelematicsService");
      const { toast } = await import("sonner");
      const result = await TelematicsService.sendCommand({
        telematics_device_id: device.id,
        vehicle_id: vehicle.id,
        command_type: commandType,
        source: "bluetooth_setup",
      });
      setResults((prev) => ({ ...prev, [commandType]: result }));
      toast.success(
        commandType === "bluetooth_power_on" ? "Bluetooth power on sent" : "Pairing info query sent"
      );
    } catch (err) {
      const { toast } = await import("sonner");
      setError(err?.message || "Command failed");
      toast.error("Bluetooth command failed", { description: err?.message });
    }
    setLoading(null);
  }, [device, vehicle]);

  if (!device?.id) return null;

  const name = vehicle?.display_name || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Vehicle";
  const btOn = device.bluetooth_on === true;
  const hasTraccar = !!device.traccar_device_id;
  const isNoran = device.provider_key === "traccar_noran_mt20";

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-card border-b border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15">
            <Bluetooth className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight" style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Bluetooth Setup
            </h1>
            <p className="text-xs text-muted-foreground leading-tight">{name}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <X className="h-5 w-5 text-foreground" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 bg-background">
        <div className="mx-auto w-full max-w-md space-y-4">
          {/* Status */}
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-foreground" style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Bluetooth Status
              </span>
              <span className={`flex items-center gap-1.5 text-xs font-semibold ${btOn ? "text-green-400" : "text-muted-foreground"}`}>
                <span className={`h-2 w-2 rounded-full ${btOn ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                {btOn ? "On" : "Off / Unknown"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Device: {device.unique_id || device.imei || "—"}
            </p>
          </div>

          {/* Power On */}
          <button
            onClick={() => sendBluetoothCommand("bluetooth_power_on")}
            disabled={loading !== null}
            className="control-tap w-full rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 flex items-center gap-3 disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20">
              <Power className="h-5 w-5 text-blue-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-foreground" style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Power On Bluetooth
              </p>
              <p className="text-xs text-muted-foreground">Sends command 008 — enables the Bluetooth module</p>
            </div>
            {loading === "bluetooth_power_on" ? (
              <RefreshCw className="h-4 w-4 animate-spin text-blue-400" />
            ) : results.bluetooth_power_on ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : null}
          </button>

          {/* Query Pairing */}
          <button
            onClick={() => sendBluetoothCommand("bluetooth_query_pairing")}
            disabled={loading !== null}
            className="control-tap w-full rounded-2xl border border-purple-500/30 bg-purple-500/10 p-4 flex items-center gap-3 disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/20">
              <BluetoothSearching className="h-5 w-5 text-purple-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-foreground" style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Query Pairing Info
              </p>
              <p className="text-xs text-muted-foreground">Sends command 024 — retrieves BT name, password & IMEI</p>
            </div>
            {loading === "bluetooth_query_pairing" ? (
              <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
            ) : results.bluetooth_query_pairing ? (
              <CheckCircle2 className="h-4 w-4 text-green-400" />
            ) : null}
          </button>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          {/* Last response */}
          {(results.bluetooth_power_on || results.bluetooth_query_pairing) && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs font-bold text-foreground mb-2" style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Command Result
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {results.bluetooth_power_on && (
                  <p>Power On: <span className="text-green-400 font-semibold">{results.bluetooth_power_on.queue_status || "sent"}</span></p>
                )}
                {results.bluetooth_query_pairing && (
                  <p>Query Pairing: <span className="text-green-400 font-semibold">{results.bluetooth_query_pairing.queue_status || "sent"}</span></p>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed">
                The device responds asynchronously. Pairing name and password arrive in the next status report — check command history or Traccar device logs for the 024 response payload.
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="rounded-2xl border border-border bg-card/50 p-4">
            <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5" style={{ fontFamily: LABEL_FONT, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              <Info className="h-3.5 w-3.5" /> Pairing Instructions
            </p>
            <ol className="space-y-1.5 text-xs text-muted-foreground leading-relaxed list-decimal list-inside">
              <li>Power on Bluetooth using the button above.</li>
              <li>Wait 10 seconds, then query pairing info.</li>
              <li>On your phone, open Bluetooth settings and scan for devices.</li>
              <li>Look for the device name returned by the 024 query.</li>
              <li>Enter the pairing password when prompted.</li>
              <li>Once paired, the device appears in your phone's Bluetooth devices list.</li>
            </ol>
          </div>

          {/* Device requirement notice */}
          {(!hasTraccar || !isNoran) && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3">
              <p className="text-xs text-yellow-400">
                {!isNoran
                  ? "Bluetooth commands are only supported on Noran MT20 devices."
                  : "This device is not linked to Traccar. Bluetooth commands require an active Traccar connection."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}