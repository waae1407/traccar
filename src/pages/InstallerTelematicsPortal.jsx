import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Camera, ClipboardCheck, Upload, Wrench } from "lucide-react";

const CHECKS = [
  ["voltage_verified", "Voltage verified"],
  ["gps_verified", "GPS verified"],
  ["ignition_verified", "Ignition verified"],
  ["lock_unlock_verified", "Lock/unlock verified"],
  ["tamper_check_verified", "Tamper check verified"],
];

function InstallerDeviceCard({ device }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ install_photos: [], installation_notes: "" });
  const submit = useMutation({
    mutationFn: (payload) => base44.functions.invoke("submitTelematicsInstallation", payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["installer-devices"] })
  });

  const uploadPhotos = async (files) => {
    const urls = [];
    for (const file of Array.from(files || [])) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setForm(prev => ({ ...prev, install_photos: [...prev.install_photos, ...urls] }));
  };

  const submitForQa = () => submit.mutate({ telematics_device_id: device.id, ...form, submit_for_qa: true });

  return <Card className="glass"><CardContent className="p-4 space-y-4"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">{device.unique_id}</p><p className="text-xs text-muted-foreground">{device.provider_key} · {device.vehicle_id || "unassigned"} · {device.lifecycle_status || "inventory"}</p></div><Camera className="h-5 w-5 text-muted-foreground" /></div><div className="grid sm:grid-cols-2 gap-2">{CHECKS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm rounded-xl border border-border p-3"><Checkbox checked={!!form[key]} onCheckedChange={checked => setForm(prev => ({ ...prev, [key]: !!checked }))} /> {label}</label>)}</div><Textarea placeholder="Installation notes" value={form.installation_notes} onChange={e => setForm(prev => ({ ...prev, installation_notes: e.target.value }))} /><div className="rounded-xl border border-border p-3"><label className="inline-flex items-center gap-2 text-sm cursor-pointer"><Upload className="h-4 w-4" />Upload install photos<input type="file" accept="image/*" multiple className="hidden" onChange={e => uploadPhotos(e.target.files)} /></label><p className="text-xs text-muted-foreground mt-2">{form.install_photos.length} photo(s) uploaded.</p></div><Button onClick={submitForQa} disabled={submit.isPending || !form.install_photos.length}>Submit Installation for Admin QA</Button><p className="text-xs text-muted-foreground">Installers can submit installations, but admin approval is required before production approval.</p></CardContent></Card>;
}

export default function InstallerTelematicsPortal() {
  const { data: devices = [] } = useQuery({ queryKey: ["installer-devices"], queryFn: () => base44.entities.TelematicsDevice.list("-created_date", 100) });
  const pending = devices.filter(d => !["approved", "live_enabled", "retired"].includes(d.lifecycle_status));
  return <div className="min-h-screen bg-background p-4 sm:p-6"><div className="max-w-4xl mx-auto space-y-5"><div><p className="text-xs font-bold text-primary uppercase tracking-widest">Installer Portal</p><h1 className="text-2xl font-black">Telematics Installation</h1><p className="text-sm text-muted-foreground">Upload photos, complete required checks, and submit installations for admin QA.</p></div><Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Installation Rules</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-3 text-sm text-muted-foreground"><p>1. Confirm provider/device ID matches the vehicle assignment.</p><p>2. Upload clear install photos before submission.</p><p>3. Complete all applicable verification checks.</p><p>4. Admin QA approval is required; installers cannot self-approve.</p></CardContent></Card><div className="grid gap-3">{pending.map(device => <InstallerDeviceCard key={device.id} device={device} />)}{pending.length === 0 && <Card className="glass"><CardContent className="p-8 text-center text-muted-foreground"><ClipboardCheck className="h-8 w-8 mx-auto mb-2" />No pending installations.</CardContent></Card>}</div></div></div>;
}