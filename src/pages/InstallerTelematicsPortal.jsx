import React, { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Camera, CheckCircle2, ScanLine, Upload, XCircle } from "lucide-react";

const REQUIRED_TESTS = [
  ["power_voltage_test", "Power / voltage", false],
  ["gps_signal_test", "GPS signal", false],
  ["ignition_acc_test", "Ignition / ACC", false],
  ["lock_test", "Lock", true],
  ["unlock_test", "Unlock", true],
  ["horn_test", "Horn", true],
  ["lights_test", "Lights", true],
  ["starter_disable_test", "Starter disable", true],
  ["starter_restore_test", "Starter restore", true],
  ["tamper_security_test", "Tamper / security", false],
];

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    provider_key: params.get("provider_key") || "",
    device_id: params.get("device_id") || ""
  };
}

function TestSelector({ label, supportsNotSupported, value, onChange }) {
  const options = supportsNotSupported ? ["pass", "fail", "not_supported"] : ["pass", "fail"];
  return (
    <div className="rounded-2xl border border-border p-3 space-y-2">
      <p className="text-sm font-bold">{label}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {options.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-xl border px-3 py-2 text-xs font-bold uppercase transition ${value === option ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
          >
            {option.replace("_", " ")}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function InstallerTelematicsPortal() {
  const initial = useMemo(getParams, []);
  const [form, setForm] = useState({
    provider_key: initial.provider_key,
    device_id: initial.device_id,
    vin: "",
    installer_name: "",
    installer_signature_name: "",
    installation_notes: "",
    install_photos: []
  });
  const [result, setResult] = useState(null);
  const submit = useMutation({
    mutationFn: (payload) => base44.functions.invoke("submitTelematicsInstallation", payload),
    onSuccess: (res) => setResult(res.data),
    onError: (error) => setResult({ ok: false, status: "error", message: error?.response?.data?.error || error.message })
  });

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const vinValid = form.vin.length === 17;

  const uploadPhotos = async (files) => {
    const urls = [];
    for (const file of Array.from(files || [])) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setForm(prev => ({ ...prev, install_photos: [...prev.install_photos, ...urls] }));
  };

  const submitInstallation = () => {
    setResult(null);
    submit.mutate({ ...form, vin: form.vin.toUpperCase() });
  };

  if (result?.status === "completed") {
    return (
      <div className="min-h-screen bg-background p-4 flex items-center justify-center">
        <Card className="glass max-w-lg w-full">
          <CardContent className="p-8 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto" />
            <h1 className="text-2xl font-black">Installation complete</h1>
            <p className="text-sm text-muted-foreground">The device was linked to the vehicle and marked installation completed. Admin/host has been notified.</p>
            <Button onClick={() => window.location.href = "/installer/telematics"}>Start Another Install</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <p className="text-xs font-bold text-primary uppercase tracking-widest">Public Installer Portal</p>
          <h1 className="text-2xl font-black">Telematics Installation</h1>
          <p className="text-sm text-muted-foreground">Scan the package QR, enter the vehicle VIN, upload photos, and complete every required test.</p>
        </div>

        <Card className="glass">
          <CardHeader><CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" />Device Scan</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            <Input placeholder="Provider key" value={form.provider_key} onChange={e => update("provider_key", e.target.value.trim())} />
            <Input placeholder="Device ID" value={form.device_id} onChange={e => update("device_id", e.target.value.trim())} />
            <p className="sm:col-span-2 text-xs text-muted-foreground">Package QR links can prefill these fields. No installer account login is required.</p>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader><CardTitle>Vehicle VIN</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="17-character VIN" value={form.vin} maxLength={17} onChange={e => update("vin", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={vinValid ? "text-green-400 border-green-500/30" : "text-yellow-400 border-yellow-500/30"}>{vinValid ? "VIN valid" : "VIN must be 17 characters"}</Badge>
              <Badge variant="outline"><Camera className="h-3 w-3 mr-1" />Camera barcode scanning depends on device/browser support</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader><CardTitle>Required Tests</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {REQUIRED_TESTS.map(([id, label, supportsNotSupported]) => (
              <TestSelector key={id} label={label} supportsNotSupported={supportsNotSupported} value={form[id]} onChange={(value) => update(id, value)} />
            ))}
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader><CardTitle>Photos and Signature</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Installer name" value={form.installer_name} onChange={e => update("installer_name", e.target.value)} />
            <Input placeholder="Installer signature name" value={form.installer_signature_name} onChange={e => update("installer_signature_name", e.target.value)} />
            <Textarea placeholder="Installer notes" value={form.installation_notes} onChange={e => update("installation_notes", e.target.value)} />
            <div className="rounded-xl border border-border p-3">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Upload className="h-4 w-4" />Upload required install photos
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => uploadPhotos(e.target.files)} />
              </label>
              <p className="text-xs text-muted-foreground mt-2">{form.install_photos.length} photo(s) uploaded.</p>
            </div>
          </CardContent>
        </Card>

        {result?.message && (
          <Card className="glass">
            <CardContent className="p-4 flex gap-3 text-sm"><XCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" /><p>{result.message}</p></CardContent>
          </Card>
        )}

        <Button className="w-full h-12" disabled={submit.isPending || !form.provider_key || !form.device_id || !vinValid || !form.installer_name || !form.installer_signature_name || !form.install_photos.length} onClick={submitInstallation}>
          {submit.isPending ? "Submitting..." : "Complete Installation"}
        </Button>
      </div>
    </div>
  );
}