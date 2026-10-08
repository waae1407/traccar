import React, { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { uploadFile } from "@/utils/uploadFile";
import CameraBarcodeScanner from "@/components/telematics/CameraBarcodeScanner";
import CommandTestTable from "@/components/installer/CommandTestTable";
import { X, ScanLine, Loader2, CheckCircle2, ChevronDown, ImagePlus } from "lucide-react";

const COMMAND_PACE_MS = 4500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const normalizeDeviceId = (v) => String(v || "").trim().toUpperCase().replace(/\s+/g, "");
const parseDeviceBarcode = (v) => { const id = normalizeDeviceId(v); return /^[A-Z0-9-_.]+$/.test(id) ? { actual_device_id: id } : null; };

export default function InstallerActionSheet({ user, onClose, onComplete }) {
  const [deviceId, setDeviceId] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [scanMessage, setScanMessage] = useState(null);
  const [scanner, setScanner] = useState(null);
  const [commandState, setCommandState] = useState({});
  const [activeCommand, setActiveCommand] = useState("");
  const [lastCommandSentAt, setLastCommandSentAt] = useState(0);
  const [testResults, setTestResults] = useState({});
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState("device");
  const [verifiedId, setVerifiedId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [vin, setVin] = useState("");
  const [vinVehicle, setVinVehicle] = useState("");
  const [vinScanner, setVinScanner] = useState(null);
  const commandLockRef = useRef("");
  const latestIdRef = useRef("");
  const typeTimerRef = useRef(null);
  const [installPhoto, setInstallPhoto] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Device capabilities — fetched only after the device is verified (scan or typed)
  const capabilities = useQuery({
    queryKey: ["installer-capabilities", verifiedId],
    queryFn: () => base44.functions.invoke("getInstallerDeviceCapabilities", { device_id: verifiedId }).then((r) => r.data),
    enabled: !!verifiedId, retry: 1, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false,
  });

  // Auto-populate test results from capabilities (auto-checks + unsupported)
  React.useEffect(() => {
    const tests = capabilities.data?.tests;
    const autoChecks = capabilities.data?.auto_checks || {};
    if (!tests) return;
    setTestResults((prev) => {
      const next = { ...prev };
      for (const [key, supported] of Object.entries(tests)) {
        if (!supported) next[key] = "not_supported";
        if (supported && next[key] === "not_supported") next[key] = "";
      }
      for (const [key, check] of Object.entries(autoChecks)) { if (check?.status) next[key] = check.status; }
      return next;
    });
  }, [capabilities.data]);

  const submit = useMutation({
    mutationFn: (p) => base44.functions.invoke("submitTelematicsInstallation", p),
    onSuccess: (r) => { setResult(r.data); if (r.data?.status === "completed") onComplete?.(); },
    onError: (e) => setResult({ ok: false, status: "error", message: e?.response?.data?.error || e.message }),
  });

  // Same device check for scanned and typed IDs
  const verifyDevice = async (id) => {
    latestIdRef.current = id;
    setVerifying(true);
    try {
      const res = await base44.functions.invoke("verifyInstallerDeviceScan", { actual_device_id: id });
      if (latestIdRef.current !== id) return;
      setProviderKey(res.data.provider_key || "");
      setVerifiedId(id);
      setVin(res.data.vin || "");
      setVinVehicle(res.data.vehicle_name || "");
      setScanMessage({ type: "success", text: res.data.message || "Device verified." });
      setExpanded(res.data.vin ? "commands" : "device");
    } catch (e) {
      if (latestIdRef.current !== id) return;
      setScanMessage({ type: "error", text: e?.response?.data?.error || "Verification failed." });
    } finally { if (latestIdRef.current === id) setVerifying(false); }
  };

  const handleTypedId = (value) => {
    const id = normalizeDeviceId(value);
    setDeviceId(id); setScanMessage(null); setVerifiedId(""); setProviderKey(""); setVin(""); setVinVehicle("");
    latestIdRef.current = id;
    clearTimeout(typeTimerRef.current);
    setVerifying(false);
    if (id.length >= 6) typeTimerRef.current = setTimeout(() => verifyDevice(id), 900);
  };

  const handleDeviceScan = async (raw) => {
    const parsed = parseDeviceBarcode(raw);
    if (!parsed) { setScanMessage({ type: "error", text: "Invalid device barcode." }); setScanner(null); return; }
    clearTimeout(typeTimerRef.current);
    setDeviceId(parsed.actual_device_id);
    setVin(""); setVinVehicle("");
    await verifyDevice(parsed.actual_device_id);
    setScanner(null);
  };

  const sendCommand = async (commandType, testKey) => {
    if (commandLockRef.current) return;
    commandLockRef.current = commandType; setActiveCommand(commandType);
    setCommandState((p) => ({ ...p, [commandType]: { status: "Sending" } }));
    try {
      const waitMs = Math.max(0, COMMAND_PACE_MS - (Date.now() - lastCommandSentAt));
      if (waitMs > 0) { setCommandState((p) => ({ ...p, [commandType]: { status: "Waiting" } })); await sleep(waitMs); }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          setCommandState((p) => ({ ...p, [commandType]: { status: "Sending" } }));
          await base44.functions.invoke("sendTelematicsCommand", { command_type: commandType, unique_id: deviceId, vin, installer_install_test: true, source: "installer_workflow" });
          setLastCommandSentAt(Date.now());
          setCommandState((p) => ({ ...p, [commandType]: { status: "Sent" } }));
          setTestResults((p) => ({ ...p, [testKey]: "pass" }));
          return;
        } catch (e) {
          const rl = e?.response?.status === 429 || /rate limit/i.test(e?.response?.data?.error || e.message || "");
          if (!rl || attempt === 2) throw e;
          const rs = Number(e?.response?.data?.retry_after_seconds || 0);
          const rm = Math.min(Math.max(rs * 1000, COMMAND_PACE_MS), 15000);
          setCommandState((p) => ({ ...p, [commandType]: { status: "Waiting", error: `Retrying in ${Math.ceil(rm / 1000)}s` } }));
          await sleep(rm);
        }
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setCommandState((p) => ({ ...p, [commandType]: { status: "Failed", error: msg } }));
      setTestResults((p) => ({ ...p, [testKey]: "fail" }));
    } finally { commandLockRef.current = ""; setActiveCommand(""); }
  };

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await uploadFile(file);
      setInstallPhoto(file_url);
    } catch (e) {
      console.error("Photo upload failed:", e.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submitInstallation = () => {
    setResult(null);
    submit.mutate({
      actual_device_id: deviceId,
      device_id: deviceId,
      provider_key: providerKey,
      vin,
      installer_name: user?.full_name || "Installer",
      installer_signature_name: user?.full_name || "Installer",
      installer_email: user?.email || "",
      install_photos: installPhoto ? [installPhoto] : [],
      ...testResults,
    });
  };

  // Derived states
  const deviceVerified = !!verifiedId && verifiedId === deviceId;
  const vinReady = !!vin.trim();
  const visibleTests = [
    "lock_test", "unlock_test", "horn_test", "lights_test", "alarm_test", "starter_disable_test", "starter_restore_test",
  ].filter((id) => capabilities.data?.tests?.[id] !== false);
  const allCommandsPassed = visibleTests.length > 0 && visibleTests.every((id) => testResults[id] === "pass");
  const canSubmit = deviceVerified && vinReady && allCommandsPassed;

  if (result?.status === "completed") {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} onClick={onClose} />
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#17181C", borderRadius: "20px 20px 0 0", padding: "24px 16px", zIndex: 91, textAlign: "center" }}>
          <CheckCircle2 size={48} color="#50C878" style={{ margin: "0 auto" }} />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#F5F5F7", margin: "12px 0 4px" }}>Installation Complete</h2>
          <p style={{ fontSize: 13, color: "#8E8E93", margin: "0 0 16px" }}>{result.message || "Device installed successfully."}</p>
          <button onClick={onClose} style={{ width: "100%", height: 48, borderRadius: 12, background: "#50C878", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Done</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} onClick={onClose} />
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#17181C", borderTop: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px 20px 0 0", padding: "12px 16px 24px", zIndex: 91, maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 8px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#F5F5F7" }}>New Installation</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#8E8E93" /></button>
        </div>

        {/* Device Section */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <SectionHeader label="Device" done={deviceVerified} active={expanded === "device"} onClick={() => setExpanded(expanded === "device" ? "" : "device")} />
          {expanded === "device" && (
            <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setScanner("device")} style={{ height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 12px" }}>
                  <ScanLine size={16} /> Scan
                </button>
                <input value={deviceId} onChange={(e) => handleTypedId(e.target.value)} placeholder="Enter device ID" style={{ flex: 1, height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontSize: 13, padding: "0 12px", outline: "none" }} />
              </div>
              {verifying && <p style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93", margin: 0, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={12} className="animate-spin" /> Checking device…</p>}
              {scanMessage && <p style={{ fontSize: 12, fontWeight: 600, color: scanMessage.type === "success" ? "#50C878" : "#FF453A", margin: 0 }}>{scanMessage.text}</p>}
              {deviceVerified && vin && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 10, background: "rgba(80,200,120,0.12)", border: "1px solid rgba(80,200,120,0.25)" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#50C878" }}>VIN {vin}{vinVehicle ? ` · ${vinVehicle}` : ""}</span>
                </div>
              )}
              {deviceVerified && !vin && <VinEntrySheet vin={vin} setVin={setVin} onScan={() => setVinScanner("vin")} />}
            </div>
          )}
        </div>

        {/* Commands Section */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <SectionHeader label="Commands" done={allCommandsPassed} active={expanded === "commands"} onClick={() => setExpanded(expanded === "commands" ? "" : "commands")} />
          {expanded === "commands" && (
            <div style={{ paddingBottom: 12 }}>
              {deviceVerified && vinReady ? (
                <CommandTestTable form={testResults} update={(k, v) => setTestResults((p) => ({ ...p, [k]: v }))} capabilities={capabilities} commandState={commandState} activeCommand={activeCommand} onSendCommand={sendCommand} />
              ) : (
                <p style={{ fontSize: 12, color: "#8E8E93", textAlign: "center", padding: "16px 0" }}>{!deviceVerified ? "Verify a device first to begin testing." : "Enter a VIN to begin testing."}</p>
              )}
            </div>
          )}
        </div>

        {/* Submit Section */}
        <div>
          <SectionHeader label="Submit" done={false} active={expanded === "submit"} onClick={() => setExpanded(expanded === "submit" ? "" : "submit")} />
          {expanded === "submit" && (
            <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <StatusChip label="Device" done={deviceVerified} />
                <StatusChip label="Commands" done={allCommandsPassed} />
              </div>
              {/* Optional installation photo — not mandatory */}
              <label style={{ position: "relative", display: "block", minHeight: 120, borderRadius: 12, overflow: "hidden", cursor: "pointer", border: installPhoto ? "1px solid rgba(80,200,120,0.3)" : "1px solid rgba(255,255,255,0.1)", background: installPhoto ? "transparent" : "#0A0A0A" }}>
                {installPhoto ? (
                  <img src={installPhoto} alt="Installed device location" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 120, padding: 12, textAlign: "center" }}>
                    {uploadingPhoto ? <Loader2 size={24} className="animate-spin" color="#8E8E93" /> : <ImagePlus size={24} color="#48484A" />}
                    <p style={{ fontSize: 12, fontWeight: 600, color: "#8E8E93", margin: "6px 0 0" }}>{uploadingPhoto ? "Uploading…" : "Add Installation Photo (Optional)"}</p>
                  </div>
                )}
                {installPhoto && <div style={{ position: "absolute", left: 8, right: 8, bottom: 8, borderRadius: 8, background: "rgba(0,0,0,0.7)", padding: "4px 8px", fontSize: 11, fontWeight: 600, color: "#50C878" }}>✓ Installation photo</div>}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ""; }} />
              </label>
              <button onClick={submitInstallation} disabled={!canSubmit || submit.isPending} style={{ width: "100%", height: 48, borderRadius: 12, background: canSubmit ? "#50C878" : "#1C1C1E", color: canSubmit ? "#fff" : "#48484A", border: "none", fontWeight: 700, fontSize: 14, cursor: canSubmit ? "pointer" : "not-allowed" }}>
                {submit.isPending ? <Loader2 size={16} className="animate-spin" /> : "Complete Installation"}
              </button>
              {result?.message && <p style={{ fontSize: 12, color: result.ok ? "#50C878" : "#FF453A", margin: 0 }}>{result.message}</p>}
            </div>
          )}
        </div>
      </div>

      <CameraBarcodeScanner open={scanner === "device"} onOpenChange={(o) => setScanner(o ? "device" : null)} title="Scan Device Barcode" helper="Point camera at the barcode on the GPS device." formats={["code_128", "code_39", "qr_code", "ean_13", "data_matrix"]} onDetected={handleDeviceScan} />
      <CameraBarcodeScanner open={vinScanner === "vin"} onOpenChange={(o) => setVinScanner(o ? "vin" : null)} title="Scan VIN Barcode" helper="Point camera at the VIN barcode inside the driver door jamb." formats={["code_39", "qr_code", "ean_13"]} onDetected={(raw) => { const v = String(raw || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, ""); if (v.length >= 11) setVin(v); setVinScanner(null); }} />
    </>
  );
}

function VinEntrySheet({ vin, setVin, onScan }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 0 0" }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "#FF9F0A", margin: 0 }}>No vehicle linked to this device. Enter the VIN to link this install to the right customer/owner.</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onScan} style={{ height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 12px" }}>
          <ScanLine size={16} /> Scan
        </button>
        <input value={vin} onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17))} placeholder="Enter VIN (17 chars)" style={{ flex: 1, height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontSize: 13, padding: "0 12px", outline: "none", letterSpacing: 1 }} />
      </div>
    </div>
  );
}

function SectionHeader({ label, done, active, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", background: "none", border: "none", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: done ? "#50C878" : active ? "#FF9F0A" : "#48484A" }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: done ? "#50C878" : "#F5F5F7", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <ChevronDown size={16} color="#8E8E93" style={{ transform: active ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
    </button>
  );
}

function StatusChip({ label, done }) {
  return (
    <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: done ? "rgba(80,200,120,0.15)" : "rgba(255,255,255,0.05)", color: done ? "#50C878" : "#8E8E93", fontWeight: 600 }}>
      {done ? "✓ " : "○ "}{label}
    </span>
  );
}