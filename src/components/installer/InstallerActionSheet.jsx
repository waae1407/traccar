import React, { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { uploadFile } from "@/utils/uploadFile";
import CameraBarcodeScanner from "@/components/telematics/CameraBarcodeScanner";
import CommandTestTable from "@/components/installer/CommandTestTable";
import { X, ScanLine, Camera, Keyboard, ImagePlus, Loader2, Check, CheckCircle2, Car, ChevronDown } from "lucide-react";

const COMMAND_PACE_MS = 4500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PHOTO_REQUIREMENTS = [
  ["vehicle_overview", "Vehicle Overview"],
  ["device_location", "Device Location"],
  ["wiring_photo", "Wiring Photo"],
];

const normalizeDeviceId = (v) => String(v || "").trim().toUpperCase().replace(/\s+/g, "");
const parseDeviceBarcode = (v) => { const id = normalizeDeviceId(v); return /^[A-Z0-9-_.]+$/.test(id) ? { actual_device_id: id } : null; };
const normalizeVin = (v) => String(v || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17);
const vehicleName = (v) => v ? [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle" : "Vehicle";

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

function PhotoTile({ title, url, uploading, onUpload }) {
  const ref = useRef(null);
  return (
    <label style={{ position: "relative", display: "block", minHeight: 90, borderRadius: 12, overflow: "hidden", border: url ? `2px solid #50C878` : "2px dashed rgba(255,255,255,0.15)", cursor: "pointer", background: "#1C1C1E" }}>
      {url ? <img src={url} alt={title} style={{ width: "100%", height: 90, objectFit: "cover" }} /> : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 90, gap: 4 }}>
          {uploading ? <Loader2 size={20} className="animate-spin" color="#50C878" /> : <ImagePlus size={20} color="#48484A" />}
          <span style={{ fontSize: 11, fontWeight: 600, color: "#8E8E93" }}>{title}</span>
        </div>
      )}
      <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { onUpload(e.target.files?.[0]); if (ref.current) ref.current.value = ""; }} />
    </label>
  );
}

export default function InstallerActionSheet({ device: initialDevice, vehicle: initialVehicle, user, onClose, onSubmitted }) {
  const [form, setForm] = useState({
    provider_key: initialDevice?.provider_key || "",
    actual_device_id: initialDevice?.unique_id || initialDevice?.imei || "",
    device_id: initialDevice?.unique_id || initialDevice?.imei || "",
    vin: initialVehicle?.vin || "",
    baseline_odometer: "",
    installer_name: user?.full_name || "",
    installer_signature_name: user?.full_name || "",
    customer_email: "",
    customer_phone: "",
    installation_notes: "",
    install_photos: [],
  });
  const [photoSlots, setPhotoSlots] = useState({ vehicle_overview: "", device_location: "", wiring_photo: "" });
  const [uploadingSlot, setUploadingSlot] = useState("");
  const [scanner, setScanner] = useState(null);
  const [scanMessage, setScanMessage] = useState(null);
  const [vinScanMessage, setVinScanMessage] = useState(null);
  const [commandState, setCommandState] = useState({});
  const [activeCommand, setActiveCommand] = useState("");
  const [lastCommandSentAt, setLastCommandSentAt] = useState(0);
  const [result, setResult] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [expanded, setExpanded] = useState("device");
  const commandLockRef = useRef("");

  const capabilities = useQuery({
    queryKey: ["installer-capabilities", form.actual_device_id],
    queryFn: () => base44.functions.invoke("getInstallerDeviceCapabilities", { device_id: form.actual_device_id }).then((r) => r.data),
    enabled: form.actual_device_id.length >= 6, retry: 1, staleTime: 5 * 60 * 1000,
  });

  const vinValid = form.vin.length === 17;
  const vehicleLookup = useQuery({
    queryKey: ["installer-vin-lookup", form.vin, form.actual_device_id],
    queryFn: () => base44.functions.invoke("lookupInstallerVehicle", { vin: form.vin, provider_key: form.provider_key, actual_device_id: form.actual_device_id }).then((r) => r.data),
    enabled: vinValid, retry: false,
  });

  useEffect(() => {
    const tests = capabilities.data?.tests;
    const autoChecks = capabilities.data?.auto_checks || {};
    if (!tests) return;
    setForm((prev) => {
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
    onSuccess: (r) => { setResult(r.data); if (r.data?.status === "completed") onSubmitted?.(); },
    onError: (e) => setResult({ ok: false, status: "error", message: e?.response?.data?.error || e.message }),
  });

  const update = (key, value) => {
    if (key === "actual_device_id") { setScanMessage(null); setForm((p) => ({ ...p, actual_device_id: value, device_id: value, provider_key: "" })); return; }
    setForm((p) => ({ ...p, [key]: value }));
  };

  const handleDeviceScan = async (raw) => {
    const parsed = parseDeviceBarcode(raw);
    if (!parsed) { setScanMessage({ type: "error", text: "Invalid device barcode." }); setScanner(null); return; }
    setForm((p) => ({ ...p, actual_device_id: parsed.actual_device_id, device_id: parsed.actual_device_id }));
    try {
      const res = await base44.functions.invoke("verifyInstallerDeviceScan", { actual_device_id: parsed.actual_device_id });
      setForm((p) => ({ ...p, provider_key: res.data.provider_key || p.provider_key }));
      setScanMessage({ type: "success", text: res.data.message || "Device verified." });
      setExpanded("vehicle");
    } catch (e) { setScanMessage({ type: "error", text: e?.response?.data?.error || "Verification failed." }); }
    setScanner(null);
  };

  const handleVinScan = (raw) => {
    const vin = normalizeVin(raw);
    if (vin.length !== 17) { setVinScanMessage({ type: "error", text: "VIN must be 17 characters." }); setScanner(null); return; }
    setForm((p) => ({ ...p, vin })); setVinScanMessage({ type: "success", text: "VIN scanned." }); setScanner(null);
  };

  const sendInstallCommand = async (commandType, testKey) => {
    if (commandLockRef.current) return;
    commandLockRef.current = commandType; setActiveCommand(commandType);
    setCommandState((p) => ({ ...p, [commandType]: { status: "Sending" } }));
    try {
      const waitMs = Math.max(0, COMMAND_PACE_MS - (Date.now() - lastCommandSentAt));
      if (waitMs > 0) { setCommandState((p) => ({ ...p, [commandType]: { status: "Waiting" } })); await sleep(waitMs); }
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          setCommandState((p) => ({ ...p, [commandType]: { status: "Sending" } }));
          await base44.functions.invoke("sendTelematicsCommand", { command_type: commandType, unique_id: form.actual_device_id, vin: form.vin, installer_install_test: true, source: "installer_workflow" });
          setLastCommandSentAt(Date.now());
          setCommandState((p) => ({ ...p, [commandType]: { status: "Sent" } }));
          update(testKey, "pass"); // AUTO-PASS on acknowledgment
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
      update(testKey, "fail"); // AUTO-FAIL on error
    } finally { commandLockRef.current = ""; setActiveCommand(""); }
  };

  const uploadRequiredPhoto = async (slot, file) => {
    if (!file) return;
    setUploadingSlot(slot); setUploadError("");
    try {
      const { file_url } = await uploadFile(file);
      setPhotoSlots((prev) => { const next = { ...prev, [slot]: file_url }; setForm((c) => ({ ...c, install_photos: [...Object.values(next).filter(Boolean)] })); return next; });
    } catch (e) { setUploadError(e?.message || "Upload failed."); } finally { setUploadingSlot(""); }
  };

  const submitInstallation = () => { setResult(null); submit.mutate({ ...form, device_id: form.actual_device_id, vin: form.vin.toUpperCase() }); };

  // Derived states
  const deviceVerified = scanMessage?.type === "success";
  const vehicleMatched = !!vehicleLookup.data?.matched;
  const vinEntered = vinValid && !vehicleLookup.isFetching && vehicleLookup.isFetched;
  const requiredPhotoCount = Object.values(photoSlots).filter(Boolean).length;
  const namesReady = !!form.installer_name && !!form.installer_signature_name;
  const visibleTests = [
    ["lock_test"], ["unlock_test"], ["horn_test"], ["lights_test"], ["alarm_test"], ["starter_disable_test"], ["starter_restore_test"],
  ].filter(([id]) => capabilities.data?.tests?.[id] !== false);
  const allCommandsPassed = visibleTests.length > 0 && visibleTests.every(([id]) => form[id] === "pass");
  const baselineOdometerReady = form.baseline_odometer !== "" && Number(form.baseline_odometer) >= 0;
  const canSubmit = deviceVerified && vinEntered && baselineOdometerReady && namesReady && allCommandsPassed;

  const sections = [
    { key: "device", label: "Device", done: deviceVerified },
    { key: "vehicle", label: "Vehicle", done: vinEntered && baselineOdometerReady },
    { key: "photos", label: "Photos", done: requiredPhotoCount > 0 && namesReady },
    { key: "commands", label: "Commands", done: allCommandsPassed },
    { key: "submit", label: "Submit", done: false },
  ];

  if (result?.status === "completed") {
    return (
      <>
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} onClick={onClose} />
        <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#17181C", borderRadius: "20px 20px 0 0", padding: "24px 16px", zIndex: 91, textAlign: "center" }}>
          <CheckCircle2 size={48} color="#50C878" style={{ margin: "0 auto" }} />
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#F5F5F7", margin: "12px 0 4px" }}>Installation Complete</h2>
          <p style={{ fontSize: 13, color: "#8E8E93", margin: "0 0 16px" }}>{result.message || "Device installed and notifications sent."}</p>
          <button onClick={onClose} style={{ width: "100%", height: 48, borderRadius: 12, background: "#50C878", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Done</button>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 90 }} onClick={onClose} />
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#17181C", borderTop: "1px solid rgba(255,255,255,0.08)", borderRadius: "20px 20px 0 0", padding: "12px 16px 24px", zIndex: 91, maxHeight: "85vh", overflowY: "auto" }}>
        <style>{`@keyframes slideUp { from { transform: translateX(-50%) translateY(100%); } to { transform: translateX(-50%) translateY(0); } }`}</style>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 8px" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            {initialVehicle?.image_url ? <img src={initialVehicle.image_url} alt="" style={{ width: "100%", height: "100%", borderRadius: 10, objectFit: "cover" }} /> : "🚗"}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#F5F5F7", margin: 0 }}>{vehicleName(initialVehicle)}</p>
            <p style={{ fontSize: 11, color: "#8E8E93", margin: "1px 0 0" }}>{form.actual_device_id || "Scan device to begin"}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><X size={18} color="#8E8E93" /></button>
        </div>

        {/* Device Section */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <SectionHeader label="Device" done={deviceVerified} active={expanded === "device"} onClick={() => setExpanded(expanded === "device" ? "" : "device")} />
          {expanded === "device" && (
            <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setScanner("device")} style={{ flex: 1, height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <ScanLine size={16} /> Scan
                </button>
                <input value={form.actual_device_id} onChange={(e) => update("actual_device_id", normalizeDeviceId(e.target.value))} placeholder="Enter device ID" style={{ flex: 1, height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontSize: 13, padding: "0 12px", outline: "none" }} />
              </div>
              {scanMessage && <p style={{ fontSize: 12, fontWeight: 600, color: scanMessage.type === "success" ? "#50C878" : "#FF453A", margin: 0 }}>{scanMessage.text}</p>}
            </div>
          )}
        </div>

        {/* Vehicle Section */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <SectionHeader label="Vehicle" done={vinEntered && baselineOdometerReady} active={expanded === "vehicle"} onClick={() => setExpanded(expanded === "vehicle" ? "" : "vehicle")} />
          {expanded === "vehicle" && (
            <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setScanner("vin")} style={{ height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "0 12px" }}>
                  <Camera size={16} /> Scan VIN
                </button>
                <input value={form.vin} onChange={(e) => update("vin", normalizeVin(e.target.value))} placeholder="17-char VIN" maxLength={17} style={{ flex: 1, height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontSize: 13, padding: "0 12px", letterSpacing: "0.05em", outline: "none" }} />
              </div>
              {vinScanMessage && <p style={{ fontSize: 12, fontWeight: 600, color: vinScanMessage.type === "success" ? "#50C878" : "#FF453A", margin: 0 }}>{vinScanMessage.text}</p>}
              {vehicleMatched && <p style={{ fontSize: 12, color: "#50C878", fontWeight: 600, margin: 0 }}>✓ {vehicleName(vehicleLookup.data?.vehicle)}</p>}
              <input type="number" value={form.baseline_odometer} onChange={(e) => update("baseline_odometer", e.target.value)} placeholder="Baseline odometer (miles)" style={{ height: 44, borderRadius: 12, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontSize: 13, padding: "0 12px", outline: "none" }} />
            </div>
          )}
        </div>

        {/* Photos Section */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <SectionHeader label="Photos" done={requiredPhotoCount > 0 && namesReady} active={expanded === "photos"} onClick={() => setExpanded(expanded === "photos" ? "" : "photos")} />
          {expanded === "photos" && (
            <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 11, color: "#8E8E93", margin: 0 }}>Optional — upload to document the install, but not required to submit.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                {PHOTO_REQUIREMENTS.map(([key, label]) => (
                  <PhotoTile key={key} title={label} url={photoSlots[key]} uploading={uploadingSlot === key} onUpload={(f) => uploadRequiredPhoto(key, f)} />
                ))}
              </div>
              {uploadError && <p style={{ fontSize: 12, color: "#FF453A", margin: 0 }}>{uploadError}</p>}
              <input value={form.installer_name} onChange={(e) => update("installer_name", e.target.value)} placeholder="Installer name" style={{ height: 40, borderRadius: 10, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontSize: 13, padding: "0 12px", outline: "none" }} />
              <input value={form.installer_signature_name} onChange={(e) => update("installer_signature_name", e.target.value)} placeholder="Signature name" style={{ height: 40, borderRadius: 10, background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.1)", color: "#F5F5F7", fontSize: 13, padding: "0 12px", outline: "none" }} />
            </div>
          )}
        </div>

        {/* Commands Section */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <SectionHeader label="Commands" done={allCommandsPassed} active={expanded === "commands"} onClick={() => setExpanded(expanded === "commands" ? "" : "commands")} />
          {expanded === "commands" && (
            <div style={{ paddingBottom: 12 }}>
              <CommandTestTable form={form} update={update} capabilities={capabilities} commandState={commandState} activeCommand={activeCommand} onSendCommand={sendInstallCommand} />
            </div>
          )}
        </div>

        {/* Submit Section */}
        <div>
          <SectionHeader label="Submit" done={false} active={expanded === "submit"} onClick={() => setExpanded(expanded === "submit" ? "" : "submit")} />
          {expanded === "submit" && (
            <div style={{ paddingBottom: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {sections.map((s) => (
                  <span key={s.key} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 999, background: s.done ? "rgba(80,200,120,0.15)" : "rgba(255,255,255,0.05)", color: s.done ? "#50C878" : "#8E8E93", fontWeight: 600 }}>
                    {s.done ? "✓ " : "○ "}{s.label}
                  </span>
                ))}
              </div>
              <button onClick={submitInstallation} disabled={!canSubmit || submit.isPending} style={{ width: "100%", height: 48, borderRadius: 12, background: canSubmit ? "#50C878" : "#1C1C1E", color: canSubmit ? "#fff" : "#48484A", border: "none", fontWeight: 700, fontSize: 14, cursor: canSubmit ? "pointer" : "not-allowed" }}>
                {submit.isPending ? <Loader2 size={16} className="animate-spin" /> : "Complete Installation"}
              </button>
              {result?.message && <p style={{ fontSize: 12, color: result.ok ? "#50C878" : "#FF453A", margin: 0 }}>{result.message}</p>}
            </div>
          )}
        </div>
      </div>

      <CameraBarcodeScanner open={scanner === "device"} onOpenChange={(o) => setScanner(o ? "device" : null)} title="Scan Device Barcode" helper="Point camera at the barcode on the GPS device." formats={["code_128", "code_39", "qr_code", "ean_13", "data_matrix"]} onDetected={handleDeviceScan} />
      <CameraBarcodeScanner open={scanner === "vin"} onOpenChange={(o) => setScanner(o ? "vin" : null)} title="Scan VIN" helper="Point camera at the VIN barcode." formats={["code_39", "code_128", "qr_code"]} onDetected={handleVinScan} />
    </>
  );
}