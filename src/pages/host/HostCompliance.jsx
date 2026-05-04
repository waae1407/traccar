import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Shield, AlertTriangle, CheckCircle2, Clock, Plus } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusConfig = {
  valid: { label: "Valid", color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle2 },
  expiring_soon: { label: "Expiring Soon", color: "text-yellow-600", bg: "bg-yellow-50", icon: AlertTriangle },
  expired: { label: "Expired", color: "text-red-600", bg: "bg-red-50", icon: AlertTriangle },
  pending_review: { label: "Pending Review", color: "text-blue-600", bg: "bg-blue-50", icon: Clock },
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
    <div className="space-y-5">
      <HostPageHeader
        title="Compliance"
        subtitle="Insurance, registration & inspection docs"
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            <Plus className="h-4 w-4" /> Upload Doc
          </button>
        }
      />

      {expiring.length > 0 && (
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <p className="font-bold text-red-800 text-sm">{expiring.length} document{expiring.length > 1 ? "s" : ""} need attention</p>
          </div>
          <div className="space-y-1">
            {expiring.map(d => (
              <p key={d.id} className="text-xs text-red-600">• {d.vehicle_name} — {docTypeLabels[d.doc_type]} ({d.status === "expired" ? "EXPIRED" : `expires ${d.expiry_date}`})</p>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Shield className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="font-bold text-gray-900 text-lg mb-2">No documents yet</h3>
          <p className="text-gray-400 text-sm mb-5">Upload insurance, registration, and inspection docs for each vehicle</p>
          <button onClick={() => setOpen(true)} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>Upload First Document</button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-50">
            {docs.map(d => {
              const cfg = statusConfig[d.status] || statusConfig.pending_review;
              const Icon = cfg.icon;
              return (
                <div key={d.id} className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                      <Icon className={`h-5 w-5 ${cfg.color}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{d.vehicle_name}</p>
                      <p className="text-xs text-gray-400">{docTypeLabels[d.doc_type]}{d.expiry_date ? ` · Expires ${d.expiry_date}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {d.doc_url && <a href={d.doc_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-pink-600 hover:text-pink-700">View</a>}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white border-gray-200">
          <DialogHeader><DialogTitle className="text-gray-900">Upload Document</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Vehicle *</label>
              <Select value={form.vehicle_id} onValueChange={v => setForm(p => ({ ...p, vehicle_id: v }))}>
                <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200 text-gray-900"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.year} {v.make} {v.model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Document Type *</label>
              <Select value={form.doc_type} onValueChange={v => setForm(p => ({ ...p, doc_type: v }))}>
                <SelectTrigger className="rounded-xl bg-gray-50 border-gray-200 text-gray-900"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(docTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Expiry Date</label>
              <input type="date" className="w-full px-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 focus:outline-none focus:border-pink-400 text-sm"
                value={form.expiry_date} onChange={e => setForm(p => ({ ...p, expiry_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Upload File *</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" required onChange={e => setForm(p => ({ ...p, file: e.target.files[0] }))}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-pink-50 file:text-pink-600 hover:file:bg-pink-100" />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button type="submit" disabled={uploading || saveMutation.isPending} className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {uploading ? "Uploading..." : "Upload"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}