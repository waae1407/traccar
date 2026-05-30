import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Upload, Wrench } from "lucide-react";

const CHECKS = [
  ["voltage_verified", "Voltage verified"],
  ["gps_verified", "GPS verified"],
  ["ignition_verified", "Ignition verified"],
  ["lock_unlock_verified", "Lock/unlock verified"],
  ["tamper_check_verified", "Tamper check verified"],
];

export default function PublicInstallerJob() {
  const { installToken } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ install_photos: [], installation_notes: "", installer_signature_name: "" });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      const res = await base44.functions.invoke("getInstallerJob", { install_token: installToken });
      setJob(res.data);
      setForm(prev => ({ ...prev, ...res.data.record }));
      setLoading(false);
    };
    load().catch(err => { setError(err?.response?.data?.error || err.message || "Invalid installation link"); setLoading(false); });
  }, [installToken]);

  const uploadPhotos = async (files) => {
    const urls = [];
    for (const file of Array.from(files || [])) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setForm(prev => ({ ...prev, install_photos: [...(prev.install_photos || []), ...urls] }));
  };

  const submit = async () => {
    setSaving(true);
    await base44.functions.invoke("submitInstallerJob", { install_token: installToken, ...form });
    setDone(true);
    setSaving(false);
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error) return <div className="min-h-screen grid place-items-center bg-background p-4"><Card className="max-w-md glass"><CardContent className="p-8 text-center"><AlertTriangle className="h-10 w-10 mx-auto text-yellow-400 mb-3" /><h1 className="text-xl font-black">Installation link unavailable</h1><p className="text-sm text-muted-foreground mt-2">{error}</p></CardContent></Card></div>;
  if (done || job?.locked) return <div className="min-h-screen grid place-items-center bg-background p-4"><Card className="max-w-md glass"><CardContent className="p-8 text-center"><CheckCircle2 className="h-10 w-10 mx-auto text-green-400 mb-3" /><h1 className="text-xl font-black">Installation submitted</h1><p className="text-sm text-muted-foreground mt-2">This job is locked for admin QA review.</p></CardContent></Card></div>;

  const { device = {}, vehicle = {} } = job || {};
  return <div className="min-h-screen bg-background p-4 sm:p-6"><div className="max-w-3xl mx-auto space-y-4"><div><p className="text-xs font-bold text-primary uppercase tracking-widest">Secure installer job</p><h1 className="text-2xl font-black">Telematics Installation</h1><p className="text-sm text-muted-foreground">This link only grants access to this assigned installation job.</p></div>
    <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" />Assigned Job</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 gap-3 text-sm"><div><p className="text-muted-foreground">Device</p><p className="font-bold">{device.unique_id || device.id || "Assigned device"}</p><p className="text-xs text-muted-foreground">{device.provider_key || "Provider hidden"} · {device.model || "Model not set"}</p></div><div><p className="text-muted-foreground">Vehicle</p><p className="font-bold">{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Assigned vehicle"}</p><p className="text-xs text-muted-foreground">{[vehicle.color, vehicle.plate].filter(Boolean).join(" · ")}</p></div><div className="sm:col-span-2"><p className="text-muted-foreground">Install location</p><p className="font-bold">{[vehicle.pickup_address, vehicle.city, vehicle.state].filter(Boolean).join(", ") || "Provided by admin"}</p></div></CardContent></Card>
    <Card className="glass"><CardHeader><CardTitle>Installation Instructions</CardTitle></CardHeader><CardContent className="grid sm:grid-cols-2 gap-3 text-sm text-muted-foreground"><p>1. Confirm device ID matches the assigned hardware.</p><p>2. Complete the verification checklist.</p><p>3. Upload clear installation photos.</p><p>4. Sign your name and submit for admin QA.</p><p className="sm:col-span-2 flex items-center gap-2"><Lock className="h-4 w-4" /> Remote commands are not available from this public installer link.</p></CardContent></Card>
    <Card className="glass"><CardContent className="p-4 space-y-4"><div className="grid sm:grid-cols-2 gap-2">{CHECKS.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm rounded-xl border border-border p-3"><Checkbox checked={!!form[key]} onCheckedChange={checked => setForm(prev => ({ ...prev, [key]: !!checked }))} /> {label}</label>)}</div><Textarea placeholder="Installation notes" value={form.installation_notes || ""} onChange={e => setForm(prev => ({ ...prev, installation_notes: e.target.value }))} /><div className="rounded-xl border border-border p-3"><label className="inline-flex items-center gap-2 text-sm cursor-pointer"><Upload className="h-4 w-4" />Upload install photos<input type="file" accept="image/*" multiple className="hidden" onChange={e => uploadPhotos(e.target.files)} /></label><p className="text-xs text-muted-foreground mt-2">{(form.install_photos || []).length} photo(s) uploaded.</p></div><Input placeholder="Installer signature name" value={form.installer_signature_name || ""} onChange={e => setForm(prev => ({ ...prev, installer_signature_name: e.target.value }))} /><Button onClick={submit} disabled={saving || !(form.install_photos || []).length || !form.installer_signature_name}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Submit for Admin QA</Button><Badge variant="outline">Expires {job.record.install_token_expires_at ? new Date(job.record.install_token_expires_at).toLocaleString() : "by admin policy"}</Badge></CardContent></Card>
  </div></div>;
}