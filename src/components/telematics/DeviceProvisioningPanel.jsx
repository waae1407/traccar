import React, { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, ShieldCheck } from "lucide-react";

const STATUS_GROUPS = [
  { key: "unassigned", label: "Unassigned Devices", match: d => d.assigned_status === "unassigned" },
  { key: "assigned", label: "Assigned Devices", match: d => d.assigned_status === "assigned" && d.install_status !== "installed" },
  { key: "installed", label: "Installed Devices", match: d => d.install_status === "installed" },
  { key: "needs_review", label: "Needs Review", match: d => d.install_status === "needs_review" },
  { key: "retired", label: "Retired Devices", match: d => d.assigned_status === "retired" || d.install_status === "retired" },
];

function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",").map(h => h.trim());
  return lines.filter(Boolean).map(line => {
    const values = line.split(",").map(v => v.trim());
    return headers.reduce((obj, header, index) => ({ ...obj, [header]: values[index] || "" }), {});
  });
}

export default function DeviceProvisioningPanel({ devices = [], providers = [] }) {
  const fileRef = useRef(null);
  const qc = useQueryClient();
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState({ provider_key: "moovetrax", unique_id: "" });

  const createDevice = useMutation({
    mutationFn: async (payload) => base44.entities.TelematicsDevice.create({ ...payload, assigned_status: payload.vehicle_id ? "assigned" : "unassigned", install_status: payload.install_status || "not_started", created_at: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["telematics-devices"] })
  });

  const importCsv = async (file) => {
    const rows = parseCsv(await file.text());
    const existingKeys = new Set(devices.flatMap(d => [`${d.provider_key}:${d.unique_id}`, d.device_imei, d.sim_iccid].filter(Boolean)));
    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const provider_key = row.provider_key || "moovetrax";
      const unique_id = row.unique_id || row.provider_device_id || row.imei;
      const duplicate = existingKeys.has(`${provider_key}:${unique_id}`) || existingKeys.has(row.imei) || existingKeys.has(row.sim_iccid);
      if (!unique_id || duplicate) { skipped++; continue; }
      await base44.entities.TelematicsDevice.create({
        provider_key, unique_id, device_imei: row.imei, sim_iccid: row.sim_iccid, provider_device_id: row.provider_device_id,
        traccar_device_id: row.traccar_device_id, model: row.model, batch_number: row.batch_number, host_id: row.host_id,
        vehicle_id: row.vehicle_id, assigned_status: row.vehicle_id ? "assigned" : "unassigned", install_status: "not_started", created_at: new Date().toISOString()
      });
      existingKeys.add(`${provider_key}:${unique_id}`); if (row.imei) existingKeys.add(row.imei); if (row.sim_iccid) existingKeys.add(row.sim_iccid); created++;
    }
    setResult({ created, skipped });
    qc.invalidateQueries({ queryKey: ["telematics-devices"] });
  };

  return <Card className="glass"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Device Provisioning</CardTitle></CardHeader><CardContent className="space-y-5"><div className="grid md:grid-cols-4 gap-2"><Input placeholder="Provider key" value={manual.provider_key} onChange={e => setManual(p => ({ ...p, provider_key: e.target.value }))} /><Input placeholder="Unique ID" value={manual.unique_id} onChange={e => setManual(p => ({ ...p, unique_id: e.target.value }))} /><Input placeholder="SIM ICCID" onChange={e => setManual(p => ({ ...p, sim_iccid: e.target.value }))} /><Button onClick={() => createDevice.mutate(manual)} disabled={!manual.unique_id}>Add Device</Button></div><div className="rounded-2xl border border-border p-4"><input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} /><Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Bulk Upload CSV</Button><p className="text-xs text-muted-foreground mt-2">Columns: provider_key, unique_id, imei, sim_iccid, provider_device_id, traccar_device_id, model, batch_number, host_id, vehicle_id.</p>{result && <p className="text-xs text-muted-foreground mt-2">Imported {result.created}; skipped {result.skipped} duplicates.</p>}</div><div className="grid md:grid-cols-5 gap-3">{STATUS_GROUPS.map(group => <div key={group.key} className="rounded-2xl border border-border p-3"><p className="text-xs font-bold text-muted-foreground mb-2">{group.label}</p><Badge variant="outline">{devices.filter(group.match).length}</Badge></div>)}</div></CardContent></Card>;
}