import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Camera, CheckCircle2, ScanLine, Upload, XCircle } from "lucide-react";

const REQUIRED_TESTS = [
  ["power_voltage_test", "Power / voltage"],
  ["gps_signal_test", "GPS signal"],
  ["ignition_acc_test", "Ignition / ACC"],
  ["lock_test", "Lock"],
  ["unlock_test", "Unlock"],
  ["horn_test", "Horn"],
  ["lights_test", "Lights"],
  ["starter_disable_test", "Starter Disable"],
  ["starter_restore_test", "Starter Restore"],
];

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    provider_key: params.get("provider_key") || "",
    device_id: params.get("device_id") || ""
  };
}

function TestSelector({ label, value, warning, onChange }) {
  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 space-y-3 shadow-sm">
      <p className="text-sm font-black text-slate-900">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {["pass", "fail"].map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-2xl border px-4 py-3 text-xs font-black uppercase tracking-wide transition ${value === option ? option === "pass" ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-100" : "border-red-500 bg-red-50 text-red-700 shadow-sm shadow-red-100" : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"}`}
          >
            {option}
          </button>
        ))}
      </div>
      {warning && <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">This Noran device supports this function. Run the test and mark Pass or Fail.</p>}
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
  const capabilities = useQuery({
    queryKey: ["installer-capabilities", form.provider_key, form.device_id],
    queryFn: () => base44.functions.invoke("getInstallerDeviceCapabilities", { provider_key: form.provider_key, device_id: form.device_id }).then(res => res.data),
    enabled: !!form.provider_key && !!form.device_id,
    retry: false
  });

  useEffect(() => {
    const tests = capabilities.data?.tests;
    if (!tests) return;
    setForm(prev => {
      const next = { ...prev };
      for (const [key, supported] of Object.entries(tests)) {
        if (!supported) next[key] = "not_supported";
        if (supported && next[key] === "not_supported") next[key] = "";
      }
      return next;
    });
  }, [capabilities.data]);

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

  const visibleTestIds = REQUIRED_TESTS.filter(([id]) => capabilities.data?.tests?.[id] !== false).map(([id]) => id);
  const supportedTestsComplete = visibleTestIds.every(id => ["pass", "fail"].includes(form[id]));

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
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-pink-50 p-4 text-slate-900 sm:p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-xl shadow-slate-200/60 backdrop-blur">
          <p className="text-xs font-black text-primary uppercase tracking-[0.25em]">Public Installer Portal</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Telematics Installation</h1>
          <p className="mt-2 text-sm text-slate-500">Scan the package QR, enter the vehicle VIN, upload photos, and complete every required test.</p>
        </div>

        <Card className="border-white/80 bg-white/90 text-slate-900 shadow-xl shadow-slate-200/60 backdrop-blur">
          <CardHeader><CardTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5 text-primary" />Device Scan</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-3">
            <Input className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" placeholder="Provider key" value={form.provider_key} onChange={e => update("provider_key", e.target.value.trim())} />
            <Input className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" placeholder="Device ID" value={form.device_id} onChange={e => update("device_id", e.target.value.trim())} />
            <p className="sm:col-span-2 text-xs text-slate-500">Package QR links can prefill these fields. No installer account login is required.</p>
          </CardContent>
        </Card>

        <Card className="border-white/80 bg-white/90 text-slate-900 shadow-xl shadow-slate-200/60 backdrop-blur">
          <CardHeader><CardTitle>Vehicle VIN</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" placeholder="17-character VIN" value={form.vin} maxLength={17} onChange={e => update("vin", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={vinValid ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}>{vinValid ? "VIN valid" : "VIN must be 17 characters"}</Badge>
              <Badge variant="outline"><Camera className="h-3 w-3 mr-1" />Camera barcode scanning depends on device/browser support</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/80 bg-white/90 text-slate-900 shadow-xl shadow-slate-200/60 backdrop-blur">
          <CardHeader><CardTitle>Required Tests</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {REQUIRED_TESTS.map(([id, label]) => {
              const supported = capabilities.data?.tests?.[id] !== false;
              if (!supported) return null;
              return <TestSelector key={id} label={label} value={form[id]} warning={form[id] === "not_supported"} onChange={(value) => update(id, value)} />;
            })}
          </CardContent>
        </Card>

        <Card className="border-white/80 bg-white/90 text-slate-900 shadow-xl shadow-slate-200/60 backdrop-blur">
          <CardHeader><CardTitle>Photos and Signature</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" placeholder="Installer name" value={form.installer_name} onChange={e => update("installer_name", e.target.value)} />
            <Input className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" placeholder="Installer signature name" value={form.installer_signature_name} onChange={e => update("installer_signature_name", e.target.value)} />
            <Textarea className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400" placeholder="Installer notes" value={form.installation_notes} onChange={e => update("installation_notes", e.target.value)} />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Upload className="h-4 w-4" />Upload required install photos
                <input type="file" accept="image/*" multiple className="hidden" onChange={e => uploadPhotos(e.target.files)} />
              </label>
              <p className="text-xs text-muted-foreground mt-2">{form.install_photos.length} photo(s) uploaded.</p>
            </div>
          </CardContent>
        </Card>

        {result?.message && (
          <Card className="border-white/80 bg-white/90 text-slate-900 shadow-xl shadow-slate-200/60 backdrop-blur">
            <CardContent className="p-4 flex gap-3 text-sm"><XCircle className="h-5 w-5 text-yellow-400 flex-shrink-0" /><p>{result.message}</p></CardContent>
          </Card>
        )}

        <Button className="h-12 w-full rounded-2xl bg-slate-950 font-black text-white shadow-xl shadow-slate-300 hover:bg-slate-800" disabled={submit.isPending || capabilities.isLoading || !form.provider_key || !form.device_id || !vinValid || !form.installer_name || !form.installer_signature_name || !form.install_photos.length || !supportedTestsComplete} onClick={submitInstallation}>
          {submit.isPending ? "Submitting..." : "Complete Installation"}
        </Button>
      </div>
    </div>
  );
}