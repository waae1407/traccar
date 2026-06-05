import React, { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const STATUS_GROUPS = [
  { key: "unassigned", label: "Unassigned Devices", match: d => !d.vehicle_id && d.assigned_status !== "assigned" && d.lifecycle_status !== "retired" },
  { key: "assigned", label: "Assigned Devices", match: d => Boolean(d.vehicle_id) && !["installed", "completed"].includes(d.install_status) && d.lifecycle_status !== "retired" },
  { key: "installed", label: "Installed Devices", match: d => ["installed", "completed"].includes(d.install_status) || ["installation_completed", "live_ready", "live_enabled"].includes(d.lifecycle_status) },
  { key: "needs_review", label: "Needs Review", match: d => ["failed", "correction_needed"].includes(d.install_status) || d.qa_status === "rejected" },
  { key: "retired", label: "Retired Devices", match: d => d.assigned_status === "retired" || d.install_status === "retired" || d.lifecycle_status === "retired" },
];

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",").map(h => h.trim());
  return lines.filter(Boolean).map(line => {
    const values = line.split(",").map(v => v.trim());
    return headers.reduce((obj, header, index) => {
      const normalized = header.toLowerCase().replace(/\s+/g, "_");
      return { ...obj, [normalized]: values[index] || "" };
    }, {});
  });
}

export default function DeviceProvisioningPanel({ devices = [], providers = [] }) {
  const fileRef = useRef(null);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [result, setResult] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [manual, setManual] = useState({ provider_key: "traccar_noran_mt20", model: "", unique_id: "" });

  const createDevice = useMutation({
    mutationFn: async (payload) => base44.functions.invoke("provisionTelematicsDevices", { device: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["telematics-devices"] })
  });

  const importCsv = async (file) => {
    setIsUploading(true);
    setResult(null);
    const details = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const rows = parseCsv(await file.text());
      const existingKeys = new Set(devices.flatMap(d => [`${d.provider_key}:${d.unique_id}`, d.device_imei, d.sim_iccid].filter(Boolean)));

      if (!rows.length) {
        failed = 1;
        details.push({ status: "failed", unique_id: "CSV", reason: "No device rows found in the file." });
      }

      for (const row of rows) {
        const provider_key = "traccar_noran_mt20";
        const unique_id = (row.unique_id || "").trim();
        const duplicate = existingKeys.has(`${provider_key}:${unique_id}`);

        if (!unique_id) {
          skipped++;
          details.push({ status: "skipped", unique_id: "Row without Unique ID", reason: "Missing Unique ID column/value." });
          continue;
        }

        if (duplicate) {
          skipped++;
          details.push({ status: "skipped", unique_id, reason: "Device already exists locally." });
          continue;
        }

        try {
          const response = await base44.functions.invoke("provisionTelematicsDevices", { devices: [{
            provider_key, unique_id, model: row.name
          }] });

          if (response.data?.created_count) {
            existingKeys.add(`${provider_key}:${unique_id}`);
            created++;
            details.push({ status: "created", unique_id, reason: "Created in Traccar and added to inventory." });
          } else {
            skipped++;
            const reason = response.data?.skipped?.[0]?.reason || response.data?.error || "Device was not created.";
            details.push({ status: "skipped", unique_id, reason });
          }
        } catch (error) {
          failed++;
          details.push({ status: "failed", unique_id, reason: error.message || "Upload failed for this device." });
        }
      }

      const summary = { created, skipped, failed, details };
      setResult(summary);
      toast({
        title: failed || skipped ? "Bulk upload completed with notices" : "Bulk upload complete",
        description: `${created} created, ${skipped} skipped, ${failed} failed.`,
        variant: failed ? "destructive" : "default"
      });
      qc.invalidateQueries({ queryKey: ["telematics-devices"] });
    } catch (error) {
      const summary = { created: 0, skipped: 0, failed: 1, details: [{ status: "failed", unique_id: file.name, reason: error.message || "Could not read this CSV file." }] };
      setResult(summary);
      toast({ title: "Bulk upload failed", description: summary.details[0].reason, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Device Provisioning</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid md:grid-cols-3 gap-2"><Input placeholder="Name" value={manual.model} onChange={e => setManual(p => ({ ...p, model: e.target.value }))} /><Input placeholder="Unique ID *" value={manual.unique_id} onChange={e => setManual(p => ({ ...p, unique_id: e.target.value }))} /><Button onClick={() => createDevice.mutate(manual)} disabled={!manual.unique_id || createDevice.isPending}>{createDevice.isPending ? "Adding..." : "Add Device"}</Button></div><div className="rounded-2xl border border-border p-4"><input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} /><Button variant="outline" onClick={() => fileRef.current?.click()} disabled={isUploading}><Upload className="h-4 w-4 mr-2" />{isUploading ? "Uploading..." : "Bulk Upload CSV"}</Button><p className="text-xs text-muted-foreground mt-2">CSV columns: Name, Unique ID. Devices are created in Traccar first, then linked here.</p>{result && <div className="mt-3 rounded-xl border border-border bg-background/40 p-3 text-xs"><p className="font-semibold text-foreground">Upload result: {result.created} created, {result.skipped} skipped, {result.failed} failed.</p>{result.details?.length > 0 && <div className="mt-2 max-h-36 overflow-auto space-y-1">{result.details.map((item, index) => <p key={index} className={item.status === "failed" ? "text-red-400" : item.status === "created" ? "text-green-400" : "text-muted-foreground"}><span className="font-medium">{item.unique_id}</span>: {item.reason}</p>)}</div>}</div>}</div><div className="grid md:grid-cols-5 gap-3">{STATUS_GROUPS.map(group => <div key={group.key} className="rounded-2xl border border-border p-3"><p className="text-xs font-bold text-muted-foreground mb-2">{group.label}</p><Badge variant="outline">{devices.filter(group.match).length}</Badge></div>)}</div></CardContent></Card>;
}