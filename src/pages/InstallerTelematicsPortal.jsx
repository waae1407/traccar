import { uploadFile } from "@/utils/uploadFile";
import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import CameraBarcodeScanner from "@/components/telematics/CameraBarcodeScanner";
import InstallerTestingStep from "@/components/telematics/installer/InstallerTestingStep";
import InstallerHelpChat from "@/components/telematics/installer/InstallerHelpChat";
import PreferredInstallerJoinBox from "@/components/installers/PreferredInstallerJoinBox";
import {
  ArrowLeft,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ImagePlus,
  Keyboard,
  Loader2,
  ScanLine,
  Upload,
  User,
  XCircle
} from "lucide-react";

const COMMAND_PACE_MS = 4500;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const REQUIRED_TESTS = [
  ["device_online", "Device Online", "📡"],
  ["power_voltage_test", "Power / Voltage", "⚡"],
  ["gps_signal_test", "GPS Reporting", "🛰️"],
  ["ignition_acc_test", "Ignition", "🔌"],
  ["lock_test", "Lock", "🔑"],
  ["unlock_test", "Unlock", "🔓"],
  ["horn_test", "Horn", "📢"],
  ["starter_disable_test", "Starter Disable", "⛔"],
  ["starter_restore_test", "Starter Restore", "✅"],
  ["lights_test", "Lights", "💡"],
  ["alarm_test", "Alarm", "🔔"],
];

const STEPS = [
  { key: "device", label: "Device" },
  { key: "vehicle", label: "Vehicle" },
  { key: "photos", label: "Photos" },
  { key: "testing", label: "Testing" },
  { key: "complete", label: "Complete" },
];

const PHOTO_REQUIREMENTS = [
  ["vehicle_overview", "Vehicle Overview"],
  ["device_location", "Device Location"],
  ["wiring_photo", "Wiring Photo"],
];

const INSTALLER_DRAFT_KEY = "uride-installer-telematics-draft-v1";

function createInitialForm() {
  return {
    provider_key: "",
    actual_device_id: "",
    device_id: "",
    vin: "",
    baseline_odometer: "",
    installer_name: "",
    installer_signature_name: "",
    installation_notes: "",
    install_photos: []
  };
}

function loadInstallerDraft() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(INSTALLER_DRAFT_KEY);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw);
    return draft?.form ? draft : null;
  } catch {
    window.localStorage.removeItem(INSTALLER_DRAFT_KEY);
    return null;
  }
}

function saveInstallerDraft(draft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(INSTALLER_DRAFT_KEY, JSON.stringify(draft));
}

function clearInstallerDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(INSTALLER_DRAFT_KEY);
}

function normalizeDeviceId(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function parseDeviceBarcode(rawValue) {
  const actual_device_id = normalizeDeviceId(rawValue);
  return /^[A-Z0-9-_.]+$/.test(actual_device_id) ? { actual_device_id } : null;
}

function normalizeVin(value) {
  return String(value || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17);
}

function providerName(providerKey) {
  return providerKey ? "Telematics Network" : "Determined after device scan";
}

function vehicleName(vehicle) {
  if (!vehicle) return "Vehicle";
  return [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Matched Vehicle";
}

function StepProgress({ currentStep, completed }) {
  return (
    <div className="sticky top-0 z-30 -mx-4 border-b border-white/60 bg-white/85 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-b-[2rem] sm:border sm:shadow-lg sm:shadow-slate-200/50">
      <div className="grid grid-cols-5 gap-2">
        {STEPS.map((step, index) => {
          const isActive = index === currentStep;
          const isDone = completed[step.key];
          return (
            <div key={step.key} className="space-y-2">
              <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black transition-all ${isDone ? "border-emerald-300 bg-emerald-500 text-white shadow-lg shadow-emerald-200" : isActive ? "border-pink-300 bg-slate-950 text-white shadow-lg shadow-pink-200" : "border-slate-200 bg-white text-slate-400"}`}>
                {isDone ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <div className="text-center">
                <p className={`text-[9px] font-black uppercase tracking-widest ${isActive ? "text-slate-950" : "text-slate-400"}`}>Step {index + 1}</p>
                <p className={`text-[11px] font-bold ${isActive ? "text-slate-950" : "text-slate-500"}`}>{step.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LuxuryCard({ children, className = "" }) {
  return (
    <Card className={`overflow-hidden rounded-[2rem] border-white/80 bg-white/90 text-slate-900 shadow-2xl shadow-slate-200/60 backdrop-blur-xl ${className}`}>
      <CardContent className="p-5 sm:p-7">{children}</CardContent>
    </Card>
  );
}

function FieldLabel({ children }) {
  return <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{children}</p>;
}

const WIRING_DIAGRAM_URL = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e9b6202d9_9BC92AC8-0378-4BFD-A602-63508FF6D79E.png";

function WiringDiagramCard() {
  const [expanded, setExpanded] = useState(false);
  return (
    <LuxuryCard className="border-slate-100">
      <button type="button" onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between gap-3 hover:opacity-70 transition-opacity">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-white text-sm">🔌</div>
          <div className="text-left">
            <h3 className="text-base font-black text-slate-950">Wiring Diagram</h3>
            <p className="text-xs font-bold text-slate-400">Reference wire colors before connecting</p>
          </div>
        </div>
        <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform flex-shrink-0 ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && <img src={WIRING_DIAGRAM_URL} alt="Device Wiring Diagram" className="mt-4 w-full rounded-2xl border border-slate-100 object-contain bg-white" />}
    </LuxuryCard>
  );
}

function DeviceStep({ form, update, capabilities, deviceVerified, onScanDevice, scanMessage }) {
  const recognized = capabilities.data?.ok;
  const device = capabilities.data?.device;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Step 1</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Device</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Scan the barcode printed on the physical GPS device.</p>
      </div>

      <LuxuryCard>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-xl shadow-pink-200">
            <ScanLine className="h-5 w-5" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h2 className="text-xl font-black">Scan Physical Device Barcode</h2>
              <p className="mt-1 text-sm text-slate-500">Scan the QR or linear barcode on the device.</p>
            </div>
            <Button type="button" onClick={onScanDevice} className="h-14 rounded-3xl bg-primary text-base font-black text-white shadow-xl shadow-pink-200 hover:bg-primary/90">
              <ScanLine className="mr-2 h-5 w-5" /> Scan Physical Device Barcode
            </Button>
            <Input className="h-13 rounded-2xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" placeholder="Actual Device ID" value={form.actual_device_id} onChange={e => update("actual_device_id", normalizeDeviceId(e.target.value))} />
            <Badge className={`${form.actual_device_id ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"} rounded-full px-4 py-1.5 text-xs font-black`}>{form.actual_device_id ? "✓ Device ID Entered" : "Device ID Required"}</Badge>
            {scanMessage && <p className={`text-sm font-bold ${scanMessage.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{scanMessage.text}</p>}
          </div>
        </div>
      </LuxuryCard>

      <WiringDiagramCard />

      {recognized && (
        <LuxuryCard className="bg-gradient-to-br from-white via-white to-pink-50/70">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-black text-white shadow-sm">✓ Device Recognized</Badge>
              <h2 className="mt-5 text-2xl font-black tracking-tight text-slate-950">{device?.unique_id || form.actual_device_id}</h2>
              <p className="mt-1 text-sm text-slate-500">Status: {device?.install_status || device?.lifecycle_status || "Ready For Installation"}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <FieldLabel>Device ID</FieldLabel>
              <p className="break-all text-lg font-black">{device?.unique_id || form.actual_device_id}</p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <FieldLabel>Service Network</FieldLabel>
              <p className="text-lg font-black capitalize">{providerName(device?.provider_key || capabilities.data?.provider_key)}</p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm">
              <FieldLabel>Model</FieldLabel>
              <p className="text-lg font-black">{device?.model || capabilities.data?.model || "Unknown"}</p>
            </div>
          </div>
        </LuxuryCard>
      )}
    </div>
  );
}

function VehicleStep({ form, update, vehicleLookup, vehicleMatched, vinNotFound, vinEntered, onScanVin, vinScanMessage }) {
  const vehicle = vehicleLookup.data?.vehicle;
  const host = vehicleLookup.data?.host;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Step 2</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Scan Vehicle VIN</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Scan or enter the vehicle VIN to match this device to the correct vehicle.</p>
      </div>

      <LuxuryCard>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="button" onClick={onScanVin} className="h-16 rounded-3xl bg-slate-950 text-base font-black text-white shadow-xl shadow-slate-300 hover:bg-slate-800">
          <Camera className="mr-2 h-5 w-5" /> Scan / Enter VIN
          </Button>
          <Button type="button" variant="outline" onClick={() => document.getElementById("installer-vin-input")?.focus()} className="h-16 rounded-3xl border-slate-200 bg-white text-base font-black text-slate-900 hover:bg-slate-50">
            <Keyboard className="mr-2 h-5 w-5" /> Enter VIN Manually
          </Button>
        </div>
        <Input id="installer-vin-input" className="mt-4 h-14 rounded-3xl border-slate-200 bg-white px-5 text-lg font-black tracking-widest text-slate-950 placeholder:text-slate-300" placeholder="17-character VIN" value={form.vin} maxLength={17} onChange={e => update("vin", normalizeVin(e.target.value))} />
        {vinScanMessage && <p className={`mt-2 text-sm font-bold ${vinScanMessage.type === "success" ? "text-emerald-600" : "text-red-600"}`}>{vinScanMessage.text}</p>}
        <div className="mt-3 flex items-center gap-2">
          {vehicleLookup.isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <p className="text-xs font-bold text-slate-500">VIN is verified automatically once 17 characters are entered.</p>
        </div>
      </LuxuryCard>

      {vinEntered && (
        <LuxuryCard className="border-slate-100 bg-gradient-to-br from-white to-slate-50/80">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white text-sm">🔢</div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Baseline Odometer Reading</h2>
                <p className="mt-1 text-sm text-slate-500">Read the odometer from the vehicle dashboard and enter the exact miles shown right now. This anchors all future mileage tracking.</p>
              </div>
            </div>
            <Input
              type="number"
              className="h-14 rounded-3xl border-slate-200 bg-white px-5 text-lg font-black text-slate-950 placeholder:text-slate-300"
              placeholder="e.g. 48230"
              value={form.baseline_odometer}
              onChange={e => update("baseline_odometer", e.target.value)}
            />
            {form.baseline_odometer && Number(form.baseline_odometer) < 0 && (
              <p className="text-sm font-bold text-red-600">Odometer reading cannot be negative.</p>
            )}
            <Badge className={`${form.baseline_odometer && Number(form.baseline_odometer) >= 0 ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-600"} rounded-full px-4 py-1.5 text-xs font-black`}>
              {form.baseline_odometer && Number(form.baseline_odometer) >= 0 ? `✓ ${Number(form.baseline_odometer).toLocaleString()} miles recorded` : "Dashboard reading required"}
            </Badge>
          </div>
        </LuxuryCard>
      )}

      <WiringDiagramCard />

      {vehicleMatched && (
        <LuxuryCard className="border-emerald-100 bg-gradient-to-br from-white to-emerald-50/80">
          <Badge className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-black text-white">✓ Vehicle Matched</Badge>
          <div className="mt-5 flex gap-4">
            <div className="h-24 w-28 overflow-hidden rounded-3xl bg-slate-100 shadow-inner">
              {vehicle?.image_url ? <img src={vehicle.image_url} alt={vehicleName(vehicle)} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Car className="h-8 w-8 text-slate-300" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-black tracking-tight text-slate-950">{vehicleName(vehicle)}</h2>
              <p className="mt-1 break-all text-xs font-bold text-slate-500">VIN {vehicle?.vin}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-white/80 p-3">
                  <FieldLabel>Host</FieldLabel>
                  <p className="truncate text-sm font-black">{host?.business_name || host?.full_name || "Host"}</p>
                </div>
                <div className="rounded-2xl bg-white/80 p-3">
                  <FieldLabel>Fleet Status</FieldLabel>
                  <p className="truncate text-sm font-black">{vehicle?.status || "Active"}</p>
                </div>
              </div>
            </div>
          </div>
        </LuxuryCard>
      )}

      {vinNotFound && (
        <LuxuryCard className="border-yellow-100 bg-gradient-to-br from-white to-yellow-50">
          <div className="flex gap-4">
            <Clock className="h-8 w-8 flex-shrink-0 text-yellow-500" />
            <div>
              <h2 className="text-2xl font-black text-yellow-700">Vehicle Not Found Yet</h2>
              <p className="mt-2 text-sm font-bold text-yellow-700">Installation can continue. uRideHub admin will link this device when the vehicle is added.</p>
            </div>
          </div>
        </LuxuryCard>
      )}
    </div>
  );
}

function PhotoTile({ title, url, uploading, onUpload }) {
  return (
    <label className={`group relative block min-h-44 cursor-pointer overflow-hidden rounded-[2rem] border-2 border-dashed transition-all ${url ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white hover:border-primary/40 hover:bg-pink-50/40"}`}>
      {url ? (
        <img src={url} alt={title} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="flex min-h-44 flex-col items-center justify-center p-6 text-center">
          {uploading ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <ImagePlus className="h-8 w-8 text-slate-300" />}
          <p className="mt-3 text-base font-black text-slate-900">{title}</p>
          <p className="mt-1 text-xs font-bold text-slate-400">Tap to upload</p>
        </div>
      )}
      {url && <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-white/90 px-3 py-2 text-sm font-black text-slate-950 shadow-lg backdrop-blur">✓ {title}</div>}
      <input type="file" accept="image/*" className="hidden" onChange={e => onUpload(e.target.files?.[0])} />
    </label>
  );
}

function PhotosStep({ photoSlots, additionalPhotos, uploadingSlot, uploadRequiredPhoto, uploadAdditionalPhotos, requiredPhotoCount, form, update }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Step 3</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Installation Photos</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Capture the proof needed for a confident handoff.</p>
      </div>

      <LuxuryCard>
        <div className="mb-5 flex items-center justify-between gap-4 rounded-3xl bg-slate-950 p-4 text-white shadow-xl shadow-slate-300">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-white/50">Required Photos</p>
            <p className="text-xl font-black">{requiredPhotoCount} / 3 Complete</p>
          </div>
          <CheckCircle2 className={`h-8 w-8 ${requiredPhotoCount === 3 ? "text-emerald-400" : "text-white/25"}`} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {PHOTO_REQUIREMENTS.map(([key, label]) => (
            <PhotoTile key={key} title={label} url={photoSlots[key]} uploading={uploadingSlot === key} onUpload={(file) => uploadRequiredPhoto(key, file)} />
          ))}
        </div>
        <div className="mt-4 rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
          <label className="flex min-h-16 cursor-pointer items-center justify-center gap-3 rounded-3xl bg-white text-sm font-black text-slate-900 shadow-sm">
            <Upload className="h-5 w-5 text-primary" /> Optional Additional Photos
            <input type="file" accept="image/*" multiple className="hidden" onChange={e => uploadAdditionalPhotos(e.target.files)} />
          </label>
          {additionalPhotos.length > 0 && <div className="mt-3 grid grid-cols-4 gap-2">{additionalPhotos.map((url, index) => <img key={url + index} src={url} alt="Additional install" className="h-20 rounded-2xl object-cover" />)}</div>}
        </div>
      </LuxuryCard>

      <LuxuryCard>
        <div className="space-y-3">
          <div>
            <FieldLabel>Installer Name</FieldLabel>
            <Input className="h-14 rounded-3xl border-slate-200 bg-white px-5 text-slate-950 placeholder:text-slate-400" placeholder="John Smith" value={form.installer_name} onChange={e => update("installer_name", e.target.value)} />
          </div>
          <div>
            <FieldLabel>Signature Name</FieldLabel>
            <Input className="h-14 rounded-3xl border-slate-200 bg-white px-5 text-slate-950 placeholder:text-slate-400" placeholder="Confirm installer signature" value={form.installer_signature_name} onChange={e => update("installer_signature_name", e.target.value)} />
          </div>
          <Textarea className="rounded-3xl border-slate-200 bg-white px-5 py-4 text-slate-950 placeholder:text-slate-400" placeholder="Optional installer notes" value={form.installation_notes} onChange={e => update("installation_notes", e.target.value)} />
        </div>
      </LuxuryCard>
    </div>
  );
}

function TestCard({ id, label, icon, value, onChange }) {
  const isPass = value === "pass";
  const isFail = value === "fail";
  return (
    <div className={`rounded-[2rem] border p-4 shadow-lg transition-all duration-300 ${isPass ? "border-emerald-200 bg-emerald-50 shadow-emerald-100" : isFail ? "border-red-200 bg-red-50 shadow-red-100" : "border-slate-200 bg-white shadow-slate-100"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xl shadow-sm ${isPass ? "bg-emerald-500" : isFail ? "bg-red-500" : "bg-slate-100"}`}>{icon}</div>
          <div>
            <h3 className="text-lg font-black text-slate-950">{label}</h3>
            <p className={`mt-1 text-xs font-bold ${isPass ? "text-emerald-700" : isFail ? "text-red-700" : "text-slate-400"}`}>{isPass ? "✓ Action Verified" : isFail ? "✕ Needs Review" : "Ready for test"}</p>
          </div>
        </div>
        {(isPass || isFail) && <CheckCircle2 className={`h-6 w-6 ${isPass ? "text-emerald-500" : "text-red-500"}`} />}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onChange("pass")} className={`h-14 rounded-3xl border text-sm font-black uppercase tracking-wider transition-all ${isPass ? "border-emerald-500 bg-emerald-500 text-white shadow-lg shadow-emerald-200" : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300 hover:text-emerald-600"}`}>Pass</button>
        <button type="button" onClick={() => onChange("fail")} className={`h-14 rounded-3xl border text-sm font-black uppercase tracking-wider transition-all ${isFail ? "border-red-500 bg-red-500 text-white shadow-lg shadow-red-200" : "border-slate-200 bg-white text-slate-500 hover:border-red-300 hover:text-red-600"}`}>Fail</button>
      </div>
    </div>
  );
}

function TestingStep({ form, update, capabilities, visibleTests, supportedTestsComplete, allSupportedTestsPass, anySupportedTestFailed }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Step 4</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Device Testing</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Supported capabilities only. Unsupported tests are hidden automatically.</p>
      </div>

      <LuxuryCard>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Live Test Status</p>
            <p className="mt-1 text-xl font-black text-slate-950">{allSupportedTestsPass ? "All tests passed" : anySupportedTestFailed ? "Correction needed" : supportedTestsComplete ? "Ready to submit" : "Testing in progress"}</p>
          </div>
          <Badge className={`${allSupportedTestsPass ? "bg-emerald-500" : anySupportedTestFailed ? "bg-red-500" : "bg-slate-950"} rounded-full px-4 py-2 text-white`}>{visibleTests.length} Supported</Badge>
        </div>
      </LuxuryCard>

      <div className="grid gap-3">
        {visibleTests.map(([id, label, icon]) => (
          <TestCard key={id} id={id} label={label} icon={icon} value={form[id]} onChange={(value) => update(id, value)} />
        ))}
      </div>
    </div>
  );
}

function CompleteStep({ form, deviceId, vehicleLookup, readyItems, submit, submitInstallation, allSupportedTestsPass, anySupportedTestFailed, result }) {
  const vehicle = vehicleLookup.data?.vehicle;
  const host = vehicleLookup.data?.host;
  const canSubmit = readyItems.every(item => item.done);
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Step 5</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950">Complete</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">Final review before installation submission.</p>
      </div>

      <LuxuryCard>
        <div className="grid gap-3">
          {readyItems.map(item => (
            <div key={item.label} className="flex items-center justify-between rounded-3xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full ${item.done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>{item.done ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}</div>
                <p className="font-black text-slate-900">{item.label}</p>
              </div>
              <p className={`text-xs font-black uppercase tracking-widest ${item.done ? "text-emerald-600" : "text-slate-400"}`}>{item.done ? "Ready" : "Needed"}</p>
            </div>
          ))}
        </div>
      </LuxuryCard>

      <LuxuryCard className={anySupportedTestFailed ? "border-red-100 bg-red-50/80" : "bg-gradient-to-br from-white to-pink-50/70"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-3xl bg-white p-4 shadow-sm"><FieldLabel>Device</FieldLabel><p className="font-black">{deviceId}</p></div>
            <div className="rounded-3xl bg-white p-4 shadow-sm"><FieldLabel>Vehicle</FieldLabel><p className="font-black">{vehicleName(vehicle)}</p></div>
            <div className="rounded-3xl bg-white p-4 shadow-sm"><FieldLabel>Host</FieldLabel><p className="font-black">{host?.business_name || host?.full_name || "Host"}</p></div>
            <div className="rounded-3xl bg-white p-4 shadow-sm"><FieldLabel>Installed By</FieldLabel><p className="font-black">{form.installer_name || "Installer"}</p></div>
          </div>
          <Button className={`h-16 w-full rounded-3xl text-base font-black text-white shadow-xl ${anySupportedTestFailed ? "bg-red-600 shadow-red-200 hover:bg-red-700" : "bg-slate-950 shadow-slate-300 hover:bg-slate-800"}`} disabled={!canSubmit || submit.isPending} onClick={submitInstallation}>
            {submit.isPending ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Submitting...</> : anySupportedTestFailed ? "Submit Correction Needed" : "Complete Installation"}
          </Button>
          {result?.message && <div className="rounded-3xl bg-white p-4 text-sm font-bold text-slate-700">{result.message}</div>}
        </div>
      </LuxuryCard>
    </div>
  );
}

function SuccessScreen({ result, form, vehicleLookup }) {
  const record = result?.record || {};
  const vehicle = result?.vehicle || vehicleLookup.data?.vehicle;
  const host = vehicleLookup.data?.host;
  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-emerald-50 to-pink-50 p-4 text-slate-950 sm:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-2xl items-center justify-center">
        <LuxuryCard className="w-full border-emerald-100 bg-white/95 text-center">
          <div className="mx-auto flex h-24 w-24 animate-pulse items-center justify-center rounded-full bg-emerald-500 text-white shadow-2xl shadow-emerald-200">
            <CheckCircle2 className="h-12 w-12" />
          </div>
          <h1 className="mt-6 text-4xl font-black tracking-tight text-slate-950">INSTALLATION COMPLETE</h1>
          <p className="mt-2 text-sm font-bold text-slate-500">Device installed, vehicle matched, and notifications sent.</p>
          <div className="mt-7 grid gap-3 text-left">
            {[
              ["Device", record.device_unique_id || form.device_id],
              ["Vehicle", vehicleName(vehicle)],
              ["Host", host?.business_name || host?.full_name || "Host"],
              ["Installed By", record.installer_name || form.installer_name],
              ["Completed", record.installation_completed_at ? new Date(record.installation_completed_at).toLocaleString() : new Date().toLocaleString()],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className="text-right font-black text-slate-950">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-3xl bg-emerald-50 p-4 text-left">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">Notifications Sent</p>
            <div className="mt-3 flex gap-3"><Badge className="bg-emerald-500 text-white">✓ Host</Badge><Badge className="bg-emerald-500 text-white">✓ Admin</Badge></div>
          </div>
          <PreferredInstallerJoinBox installResult={result} form={form} />
          <Button className="mt-6 h-14 w-full rounded-3xl bg-slate-950 font-black text-white hover:bg-slate-800" onClick={() => { clearInstallerDraft(); window.location.href = "/installer/telematics"; }}>Start Another Install</Button>
        </LuxuryCard>
      </div>
    </div>
  );
}

export default function InstallerTelematicsPortal() {
  const [savedDraft] = useState(() => loadInstallerDraft());
  const [currentStep, setCurrentStep] = useState(() => Math.min(4, Math.max(0, Number(savedDraft?.currentStep || 0))));
  const [deviceVerified, setDeviceVerified] = useState(() => !!savedDraft?.form?.actual_device_id);
  const [form, setForm] = useState(() => ({ ...createInitialForm(), ...(savedDraft?.form || {}) }));
  const [photoSlots, setPhotoSlots] = useState(() => ({ vehicle_overview: "", device_location: "", wiring_photo: "", ...(savedDraft?.photoSlots || {}) }));
  const [additionalPhotos, setAdditionalPhotos] = useState(() => savedDraft?.additionalPhotos || []);
  const [uploadingSlot, setUploadingSlot] = useState("");
  const [result, setResult] = useState(null);
  const [scanner, setScanner] = useState(null);
  const [scanMessage, setScanMessage] = useState(() => savedDraft?.form?.actual_device_id ? { type: "success", text: "Saved installation progress restored." } : null);
  const [vinScanMessage, setVinScanMessage] = useState(null);
  const [commandState, setCommandState] = useState(() => savedDraft?.commandState || {});
  const [activeCommand, setActiveCommand] = useState("");
  const [lastCommandSentAt, setLastCommandSentAt] = useState(0);
  const [capabilityDeviceId, setCapabilityDeviceId] = useState(() => form.actual_device_id || "");
  const commandLockRef = useRef("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpTest, setHelpTest] = useState('');
  const [helpForm, setHelpForm] = useState({ name: '', phone: '', email: '', description: '' });

  useEffect(() => {
    if (result?.status === "completed") {
      clearInstallerDraft();
      return;
    }
    const hasProgress = currentStep > 0 || form.actual_device_id || form.vin || form.installer_name || form.installer_signature_name || form.install_photos?.length;
    if (!hasProgress) return;
    saveInstallerDraft({ currentStep, form, photoSlots, additionalPhotos, commandState, saved_at: new Date().toISOString() });
  }, [currentStep, form, photoSlots, additionalPhotos, commandState, result?.status]);

  useEffect(() => {
    const timer = setTimeout(() => setCapabilityDeviceId(form.actual_device_id || ""), 700);
    return () => clearTimeout(timer);
  }, [form.actual_device_id]);

  const capabilities = useQuery({
    queryKey: ["installer-capabilities", capabilityDeviceId],
    queryFn: () => base44.functions.invoke("getInstallerDeviceCapabilities", { device_id: capabilityDeviceId }).then(res => res.data),
    enabled: capabilityDeviceId.length >= 6,
    retry: 1,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const vinValid = form.vin.length === 17;
  const vehicleLookup = useQuery({
    queryKey: ["installer-vin-lookup", form.vin, form.actual_device_id],
    queryFn: () => base44.functions.invoke("lookupInstallerVehicle", { vin: form.vin, provider_key: form.provider_key, actual_device_id: form.actual_device_id }).then(res => res.data),
    enabled: vinValid,
    retry: false
  });

  useEffect(() => {
    const tests = capabilities.data?.tests;
    const autoChecks = capabilities.data?.auto_checks || {};
    if (!tests) return;
    setForm(prev => {
      const next = { ...prev };
      for (const [key, supported] of Object.entries(tests)) {
        if (!supported) next[key] = "not_supported";
        if (supported && next[key] === "not_supported") next[key] = "";
      }
      for (const [key, check] of Object.entries(autoChecks)) {
        if (check?.status) next[key] = check.status;
      }
      return next;
    });
  }, [capabilities.data]);

  const submit = useMutation({
    mutationFn: (payload) => base44.functions.invoke("submitTelematicsInstallation", payload),
    onSuccess: (res) => setResult(res.data),
    onError: (error) => setResult({ ok: false, status: "error", message: error?.response?.data?.error || error.message })
  });

  const helpRequest = useMutation({
    mutationFn: (payload) => base44.functions.invoke("requestInstallerTelematicsHelp", payload),
    onSuccess: (res) => setResult({ ok: true, status: "help_requested", message: res.data?.message || "Help request sent." }),
    onError: (error) => setResult({ ok: false, status: "error", message: error?.response?.data?.error || error.message })
  });

  const update = (key, value) => {
    if (key === "actual_device_id") {
      setDeviceVerified(false);
      setScanMessage(null);
      setForm(prev => ({ ...prev, actual_device_id: value, device_id: value, provider_key: "" }));
      return;
    }
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleDeviceScan = async (rawValue) => {
    const parsed = parseDeviceBarcode(rawValue);
    if (!parsed) {
      setScanMessage({ type: "error", text: "Invalid device barcode. Please scan the physical device barcode." });
      setScanner(null);
      return;
    }
    setForm(prev => ({ ...prev, actual_device_id: parsed.actual_device_id, device_id: parsed.actual_device_id }));
    try {
      const response = await base44.functions.invoke("verifyInstallerDeviceScan", {
        actual_device_id: parsed.actual_device_id
      });
      setForm(prev => ({ ...prev, provider_key: response.data.provider_key || prev.provider_key, actual_device_id: response.data.actual_device_id, device_id: response.data.actual_device_id }));
      setDeviceVerified(true);
      setScanMessage({ type: "success", text: response.data.message || "Device verified." });
    } catch (error) {
      setDeviceVerified(false);
      setScanMessage({ type: "error", text: error?.response?.data?.error || "Device verification failed." });
    }
    setScanner(null);
  };

  const handleVinScan = (rawValue) => {
    const vin = normalizeVin(rawValue);
    if (vin.length !== 17) {
      setVinScanMessage({ type: "error", text: "Invalid VIN barcode. VIN must be 17 characters." });
      setScanner(null);
      return;
    }
    setForm(prev => ({ ...prev, vin }));
    setVinScanMessage({ type: "success", text: "VIN scanned. Vehicle lookup started." });
    setScanner(null);
  };

  const deviceReady = !!form.actual_device_id && !capabilities.isFetching;
  const vehicleMatched = !!vehicleLookup.data?.matched;
  const vinLookupComplete = vinValid && !vehicleLookup.isFetching && vehicleLookup.isFetched;
  const vinEntered = vinLookupComplete && (vehicleLookup.data?.matched === true || vehicleLookup.data?.matched === false);
  const vinNotFound = vinLookupComplete && vehicleLookup.data?.matched === false;
  const requiredPhotoCount = Object.values(photoSlots).filter(Boolean).length;
  const photosReady = requiredPhotoCount === 3;
  const namesReady = !!form.installer_name && !!form.installer_signature_name;
  const visibleTests = REQUIRED_TESTS.filter(([id]) => capabilities.data?.tests?.[id] !== false);
  const visibleTestIds = visibleTests.map(([id]) => id);
  const supportedTestsComplete = visibleTestIds.length > 0 && visibleTestIds.every(id => ["pass", "fail"].includes(form[id]));
  const allSupportedTestsPass = visibleTestIds.length > 0 && visibleTestIds.every(id => form[id] === "pass");
  const anySupportedTestFailed = visibleTestIds.some(id => form[id] === "fail");
  const testsReady = supportedTestsComplete && allSupportedTestsPass;

  useEffect(() => {
    if (currentStep === 3 && form.actual_device_id && !capabilities.data && !capabilities.isFetching) capabilities.refetch();
  }, [currentStep, form.actual_device_id]);

  const completed = {
    device: deviceReady,
    vehicle: vinEntered,
    photos: photosReady && namesReady,
    testing: supportedTestsComplete,
    complete: result?.status === "completed"
  };

  const readyItems = [
    { label: "Physical device ID entered", done: deviceReady },
    { label: vehicleMatched ? "VIN matched" : "VIN entered", done: vinEntered },
    { label: "Baseline odometer recorded", done: baselineOdometerReady },
    { label: "Required photos uploaded", done: photosReady },
    { label: "Installer name captured", done: namesReady },
    { label: anySupportedTestFailed ? "Failed tests submitted for correction" : "All supported tests complete", done: supportedTestsComplete },
  ];

  const uploadRequiredPhoto = async (slot, file) => {
    if (!file) return;
    setUploadingSlot(slot);
    const { file_url } = await uploadFile(file);
    setPhotoSlots(prev => {
      const next = { ...prev, [slot]: file_url };
      setForm(current => ({ ...current, install_photos: [...Object.values(next).filter(Boolean), ...additionalPhotos] }));
      return next;
    });
    setUploadingSlot("");
  };

  const uploadAdditionalPhotos = async (files) => {
    const urls = [];
    for (const file of Array.from(files || [])) {
      const { file_url } = await uploadFile(file);
      urls.push(file_url);
    }
    setAdditionalPhotos(prev => {
      const next = [...prev, ...urls];
      setForm(current => ({ ...current, install_photos: [...Object.values(photoSlots).filter(Boolean), ...next] }));
      return next;
    });
  };

  const submitInstallation = () => {
    setResult(null);
    submit.mutate({ ...form, device_id: form.actual_device_id, vin: form.vin.toUpperCase() });
  };

  const sendInstallCommand = async (commandType, testKey) => {
    if (commandLockRef.current) return;
    commandLockRef.current = commandType;
    setActiveCommand(commandType);
    setCommandState(prev => ({ ...prev, [commandType]: { status: 'Sending' } }));

    try {
      const waitMs = Math.max(0, COMMAND_PACE_MS - (Date.now() - lastCommandSentAt));
      if (waitMs > 0) {
        setCommandState(prev => ({ ...prev, [commandType]: { status: 'Waiting', error: 'Waiting a few seconds to protect the command system.' } }));
        await sleep(waitMs);
      }

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          setCommandState(prev => ({ ...prev, [commandType]: { status: 'Sending' } }));
          await base44.functions.invoke('sendTelematicsCommand', {
            command_type: commandType,
            unique_id: form.actual_device_id,
            vin: form.vin,
            installer_install_test: true,
            source: 'installer_workflow'
          });
          setLastCommandSentAt(Date.now());
          setCommandState(prev => ({ ...prev, [commandType]: { status: 'Sent' } }));
          return;
        } catch (error) {
          const isRateLimited = error?.response?.status === 429 || /rate limit/i.test(error?.response?.data?.error || error.message || '');
          if (!isRateLimited || attempt === 2) throw error;
          const retrySeconds = Number(error?.response?.data?.retry_after_seconds || 0);
          const retryMs = Math.min(Math.max(retrySeconds * 1000, COMMAND_PACE_MS), 15000);
          setCommandState(prev => ({ ...prev, [commandType]: { status: 'Waiting', error: `System is pacing commands, retrying in ${Math.ceil(retryMs / 1000)} seconds.` } }));
          await sleep(retryMs);
        }
      }
    } catch (error) {
      const message = error?.response?.data?.error || error.message;
      setCommandState(prev => ({ ...prev, [commandType]: { status: 'Failed', error: message } }));
      update(testKey, 'fail');
      setHelpTest(testKey);
    } finally {
      commandLockRef.current = "";
      setActiveCommand("");
    }
  };

  const openHelp = (testKey) => {
    setHelpTest(testKey);
    setHelpOpen(true);
  };

  const requestHelp = () => {
    const name = window.prompt('Installer name', helpForm.name || form.installer_name || '');
    if (!name) return;
    const phone = window.prompt('Phone number', helpForm.phone || '');
    if (!phone) return;
    const email = window.prompt('Email optional', helpForm.email || '') || '';
    const description = window.prompt('Issue description', helpForm.description || `Need help with ${helpTest || 'telematics test'}`);
    if (!description) return;
    setHelpForm({ name, phone, email, description });
    helpRequest.mutate({
      device_id: form.actual_device_id,
      vin: form.vin,
      provider_key: form.provider_key,
      failed_test: helpTest,
      installer_name: name,
      installer_phone: phone,
      installer_email: email,
      issue_description: description,
      photos: form.install_photos
    });
  };

  const baselineOdometerReady = form.baseline_odometer !== "" && Number(form.baseline_odometer) >= 0;
  const canAdvance = [deviceReady, vinEntered && baselineOdometerReady, photosReady && namesReady, supportedTestsComplete, true][currentStep];

  if (result?.status === "completed") {
    return <SuccessScreen result={result} form={form} vehicleLookup={vehicleLookup} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-pink-50 pb-28 text-slate-900 sm:p-6">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 xl:px-8">
        <StepProgress currentStep={currentStep} completed={completed} />
        <div className="py-6 pb-32">
          {currentStep === 0 && <DeviceStep form={form} update={update} capabilities={capabilities} deviceVerified={deviceVerified} onScanDevice={() => setScanner("device")} scanMessage={scanMessage} />}
          {currentStep === 1 && <VehicleStep form={form} update={update} vehicleLookup={vehicleLookup} vehicleMatched={vehicleMatched} vinNotFound={vinNotFound} vinEntered={vinEntered} onScanVin={() => setScanner("vin")} vinScanMessage={vinScanMessage} />}
          {currentStep === 2 && <PhotosStep photoSlots={photoSlots} additionalPhotos={additionalPhotos} uploadingSlot={uploadingSlot} uploadRequiredPhoto={uploadRequiredPhoto} uploadAdditionalPhotos={uploadAdditionalPhotos} requiredPhotoCount={requiredPhotoCount} form={form} update={update} />}
          {currentStep === 3 && <InstallerTestingStep form={form} update={update} capabilities={capabilities} commandState={commandState} activeCommand={activeCommand} onSendCommand={sendInstallCommand} onHelp={openHelp} />}
          {currentStep === 4 && <CompleteStep form={form} deviceId={form.device_id} vehicleLookup={vehicleLookup} readyItems={readyItems} submit={submit} submitInstallation={submitInstallation} allSupportedTestsPass={allSupportedTestsPass} anySupportedTestFailed={anySupportedTestFailed} result={result} />}
        </div>
      </div>

      <CameraBarcodeScanner
        open={scanner === "device"}
        onOpenChange={(open) => setScanner(open ? "device" : null)}
        title="Scan Physical Device Barcode"
        helper="Point your camera at the barcode printed on the physical GPS device."
        formats={["code_128", "code_39", "qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "data_matrix"]}
        onDetected={handleDeviceScan}
      />
      <CameraBarcodeScanner
        open={scanner === "vin"}
        onOpenChange={(open) => setScanner(open ? "vin" : null)}
        title="Scan VIN Barcode"
        helper="Point your camera at the windshield or door VIN barcode."
        formats={["code_39", "code_128", "qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "data_matrix"]}
        onDetected={handleVinScan}
      />

      <InstallerHelpChat open={helpOpen} onOpenChange={setHelpOpen} contextTest={helpTest} onRequestHelp={requestHelp} />

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/70 bg-white/90 p-4 shadow-2xl shadow-slate-400/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl gap-3 px-4 sm:px-6 xl:px-8">
          <Button variant="outline" className="h-14 w-16 rounded-3xl border-slate-200 bg-white" disabled={currentStep === 0} onClick={() => setCurrentStep(step => Math.max(0, step - 1))}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {currentStep < 4 ? (
            <Button className="h-14 flex-1 rounded-3xl bg-slate-950 text-base font-black text-white shadow-xl shadow-slate-300 hover:bg-slate-800" disabled={!canAdvance} onClick={() => setCurrentStep(step => Math.min(4, step + 1))}>
              Next <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          ) : (
            <Button className={`h-14 flex-1 rounded-3xl text-base font-black text-white shadow-xl ${anySupportedTestFailed ? "bg-red-600 shadow-red-200 hover:bg-red-700" : "bg-slate-950 shadow-slate-300 hover:bg-slate-800"}`} disabled={!readyItems.every(item => item.done) || submit.isPending} onClick={submitInstallation}>
              {submit.isPending ? "Submitting..." : anySupportedTestFailed ? "Submit Correction Needed" : "Complete Installation"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}