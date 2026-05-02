import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Shield, Upload, AlertTriangle, CheckCircle2, Clock, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusConfig = {
  valid: { label: "Valid", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  expiring_soon: { label: "Expiring Soon", color: "bg-yellow-500/20 text-yellow-400", icon: AlertTriangle },
  expired: { label: "Expired", color: "bg-red-500/20 text-red-400", icon: AlertTriangle },
  pending_review: { label: "Pending Review", color: "bg-blue-500/20 text-blue-400", icon: Clock },
};

const docTypeLabels = { insurance: "Insurance", registration: "Registration", inspection: "Inspection", title: "Title" };

export default function HostCompliance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", doc_type: "insurance", expiry_date: "", file: null });

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({ queryKey: ["host-vehicles", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: docs = [], isLoading } = useQuery({ queryKey: ["host-compliance", host?.id], queryFn: () => base44.entities.HostVehicleCompliance.filter({ host_id: host.id }), enabled: !!host?.id });

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.HostVehicleCompliance.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-compliance"] }); setOpen(false); },
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setUploading(true);
    let doc_url = "";
    if (form.file) {
      const res = await base44.integrations.Core.UploadFile({ file: form.file });
      doc_url = res.file_url;
    }
    const vehicle = vehicles.find(v => v.id === form.vehicle_id);
    await saveMutation.mutateAsync({
      host_id: host.id,
      vehicle_id: form.vehicle_id,
      vehicle_name: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
      doc_type: form.doc_type,
      expiry_date: form.expiry_date,
      doc_url,
      status: "pending_review",
    });
    setUploading(false);
  };

  const expiring = docs.filter(d => d.status === "expiring_soon" || d.status === "expired");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white font-syne">Compliance Documents</h1>
          <p className="text-white/40 text-sm mt-1">Keep your insurance, registration, and inspection docs current</p>
        </div>
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white gradient-primary hover:opacity-90">
          <Plus className="h-4 w-4" /> Upload Document
        </button>
      </div>

      {expiring.length > 0 && (
        <div className="p-4 rounded-2xl border border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-3 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <p className="font-bold text-red-300">{expiring.length} document{expiring.length > 1 ? "s" : ""} need attention</p>
          </div>
          <div className="space-y-2">
            {expiring.map(d => (
              <p key={d.id} className="text-sm text-red-400/70">• {d.vehicle_name} — {docTypeLabels[d.doc_type]} ({d.status === "expired" ? "EXPIRED" : `expires ${d.expiry_date}`})</p>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-20">
          <Shield className="h-12 w-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">No documents uploaded</h3>
          <p className="text-white/40 text-sm mb-6">Upload insurance, registration, and inspection docs for each vehicle</p>
          <button onClick={() => setOpen(true)} className="px-6 py-3 rounded-xl text-sm font-bold text-white gradient-primary">Upload First Document</button>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] glass overflow-hidden">
          <div className="divide-y divide-white/[0.06]">
            {docs.map(d => {
              const cfg = statusConfig[d.status] || statusConfig.pending_review;
              const Icon = cfg.icon;
              return (
                <div key={d.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${cfg.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">{d.vehicle_name}</p>
                      <p className="text-xs text-white/40">{docTypeLabels[d.doc_type]} {d.expiry_date ? `· Expires ${d.expiry_date}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.doc_url && <a href={d.doc_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:text-primary/80">View</a>}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border-white/[0.08] text-white" style={{ background: "hsl(222 28% 9%)" }}>
          <DialogHeader><DialogTitle className="font-syne text-white">Upload Document</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Vehicle *</label>
              <Select value={form.vehicle_id} onValueChange={v => setForm(p => ({ ...p, vehicle_id: v }))}>
                <SelectTrigger className="rounded-xl bg-white/[0.06] border-white/10 text-white"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
                  {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Document Type *</label>
              <Select value={form.doc_type} onValueChange={v => setForm(p => ({ ...p, doc_type: v }))}>
                <SelectTrigger className="rounded-xl bg-white/[0.06] border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[hsl(222,28%,12%)] border-white/10 text-white">
                  {Object.entries(docTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Expiry Date</label>
              <input type="date" className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white focus:outline-none focus:border-primary/50 text-sm" value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-white/40 mb-1.5">Upload File *</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" required onChange={e => setForm(p => ({ ...p, file: e.target.files[0] }))}
                className="w-full text-sm text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm text-white/60 bg-white/[0.06] border border-white/[0.08]">Cancel</button>
              <button type="submit" disabled={uploading || saveMutation.isPending} className="px-4 py-2 rounded-xl text-sm font-bold text-white gradient-primary disabled:opacity-50">
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}