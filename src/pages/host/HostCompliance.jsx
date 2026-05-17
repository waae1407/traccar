import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Shield, AlertTriangle, CheckCircle2, Clock, Plus, Upload, Loader2, Sparkles, Info } from "lucide-react";
import { uploadFile } from "@/utils/uploadFile";
import HostPageHeader from "@/components/host/HostPageHeader";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusConfig = {
  valid: { label: "Valid", color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle2 },
  expiring_soon: { label: "Expiring Soon", color: "text-yellow-600", bg: "bg-yellow-50", icon: AlertTriangle },
  expired: { label: "Expired", color: "text-red-600", bg: "bg-red-50", icon: AlertTriangle },
  pending_review: { label: "AI Reviewing…", color: "text-blue-600", bg: "bg-blue-50", icon: Clock },
};

const DOC_TYPES = [
  { key: "insurance", label: "Insurance", required: true },
  { key: "registration", label: "Registration", required: true },
  { key: "inspection", label: "Inspection", required: false },
  { key: "title", label: "Title", required: false },
];

export default function HostCompliance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiReading, setAiReading] = useState(false);
  const [form, setForm] = useState({ vehicle_id: "", doc_type: "insurance", file: null });

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: vehicles = [] } = useQuery({ queryKey: ["host-vehicles", host?.id], queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }), enabled: !!host?.id });
  const { data: docs = [], isLoading } = useQuery({ queryKey: ["host-compliance", host?.id], queryFn: () => base44.entities.HostVehicleCompliance.filter({ host_id: host.id }), enabled: !!host?.id });

  const saveMutation = useMutation({
    mutationFn: (data) => base44.entities.HostVehicleCompliance.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["host-compliance"] }),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.file || !form.vehicle_id) return;
    setUploading(true);

    // Upload file
    const res = await uploadFile(form.file);
    const doc_url = res.file_url;

    const vehicle = vehicles.find(v => v.id === form.vehicle_id);

    // Create compliance record as pending_review
    const created = await saveMutation.mutateAsync({
      host_id: host.id,
      vehicle_id: form.vehicle_id,
      vehicle_name: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
      doc_type: form.doc_type,
      doc_url,
      status: "pending_review",
    });

    setUploading(false);
    setAiReading(true);

    // Run AI verification in background
    base44.functions.invoke("aiReadComplianceDoc", {
      doc_url,
      doc_type: form.doc_type,
      vehicle_vin: vehicle?.vin || null,
      host_id: host.id,
      vehicle_id: form.vehicle_id,
      compliance_id: created.id,
    }).then(() => {
      qc.invalidateQueries({ queryKey: ["host-compliance"] });
      qc.invalidateQueries({ queryKey: ["host-vehicles"] });
      setAiReading(false);
    }).catch(() => setAiReading(false));

    setOpen(false);
    setForm({ vehicle_id: "", doc_type: "insurance", file: null });
  };

  // Group docs by vehicle
  const docsByVehicle = vehicles.map(v => {
    const vehicleDocs = docs.filter(d => d.vehicle_id === v.id);
    const hasInsurance = vehicleDocs.some(d => d.doc_type === "insurance" && ["valid", "expiring_soon"].includes(d.status));
    const hasRegistration = vehicleDocs.some(d => d.doc_type === "registration" && ["valid", "expiring_soon"].includes(d.status));
    const isLiveReady = hasInsurance && hasRegistration;
    return { vehicle: v, docs: vehicleDocs, isLiveReady, hasInsurance, hasRegistration };
  });

  const expiring = docs.filter(d => d.status === "expiring_soon" || d.status === "expired");

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Compliance"
        subtitle="Insurance & registration required per vehicle to go live"
        action={
          <button onClick={() => setOpen(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            <Plus className="h-4 w-4" /> Upload Doc
          </button>
        }
      />

      {/* Required docs explainer */}
      <div className="p-4 rounded-2xl border border-blue-100 bg-blue-50">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-900 mb-2">Required Documents Per Vehicle</p>
            <div className="grid grid-cols-2 gap-2">
              {DOC_TYPES.map(dt => (
                <div key={dt.key} className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${dt.required ? "bg-red-500" : "bg-gray-300"}`} />
                  <span className="text-xs text-blue-800">
                    <span className="font-semibold">{dt.label}</span>
                    <span className="text-blue-500 ml-1">{dt.required ? "— Required" : "— Optional"}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-blue-600 mt-2">🤖 Our AI automatically reads your documents, extracts expiry dates, and approves vehicles. You'll be notified 30 days before expiry.</p>
          </div>
        </div>
      </div>

      {/* AI reading indicator */}
      {aiReading && (
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-violet-200 bg-violet-50">
          <Loader2 className="h-5 w-5 text-violet-500 animate-spin flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-violet-900">AI is reading your document…</p>
            <p className="text-xs text-violet-600">Extracting expiry date, VIN, and validating authenticity. This takes 10–30 seconds.</p>
          </div>
        </div>
      )}

      {/* Expiry alerts */}
      {expiring.length > 0 && (
        <div className="p-4 rounded-2xl border border-red-200 bg-red-50">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <p className="font-bold text-red-800 text-sm">{expiring.length} document{expiring.length > 1 ? "s" : ""} need attention</p>
          </div>
          <div className="space-y-1">
            {expiring.map(d => (
              <p key={d.id} className="text-xs text-red-600">
                • {d.vehicle_name} — {DOC_TYPES.find(t => t.key === d.doc_type)?.label || d.doc_type}
                {d.status === "expired" ? " ⚠️ EXPIRED — vehicle suspended" : ` · Expires ${d.expiry_date}`}
              </p>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />)}</div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Shield className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="font-bold text-gray-900 text-lg mb-2">Add vehicles first</h3>
          <p className="text-gray-400 text-sm mb-5">Add your vehicles before uploading compliance documents</p>
          <a href="/host/vehicles" className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>Add Vehicles →</a>
        </div>
      ) : (
        <div className="space-y-4">
          {docsByVehicle.map(({ vehicle: v, docs: vDocs, isLiveReady, hasInsurance, hasRegistration }) => (
            <div key={v.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* Vehicle header */}
              <div className={`px-5 py-3.5 flex items-center justify-between border-b ${isLiveReady ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"}`}>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{v.year} {v.make} {v.model}</p>
                  <p className="text-xs text-gray-400">{v.city}, {v.state}{v.vin ? ` · VIN: ${v.vin}` : ""}</p>
                </div>
                {isLiveReady ? (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Live Ready
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                    <AlertTriangle className="h-3.5 w-3.5" /> Missing Docs
                  </span>
                )}
              </div>

              {/* Required docs status */}
              <div className="px-5 py-3 border-b border-gray-50 grid grid-cols-2 gap-2">
                {[
                  { type: "insurance", label: "Insurance", has: hasInsurance },
                  { type: "registration", label: "Registration", has: hasRegistration },
                ].map(({ type, label, has }) => (
                  <div key={type} className={`flex items-center gap-2 p-2.5 rounded-xl text-xs font-semibold ${has ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                    {has ? <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />}
                    {label} {has ? "✓" : "— Required"}
                    {!has && (
                      <button onClick={() => { setForm({ vehicle_id: v.id, doc_type: type, file: null }); setOpen(true); }}
                        className="ml-auto text-[10px] font-bold underline">Upload</button>
                    )}
                  </div>
                ))}
              </div>

              {/* All docs for this vehicle */}
              {vDocs.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {vDocs.map(d => {
                    const cfg = statusConfig[d.status] || statusConfig.pending_review;
                    const Icon = cfg.icon;
                    const docInfo = DOC_TYPES.find(t => t.key === d.doc_type);
                    return (
                      <div key={d.id} className="px-5 py-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                            <Icon className={`h-4 w-4 ${cfg.color}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-gray-900">{docInfo?.label || d.doc_type}</p>
                              {docInfo?.required && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">Required</span>}
                            </div>
                            <p className="text-xs text-gray-400">
                              {d.expiry_date ? `Expires ${d.expiry_date}` : "Expiry pending AI read"}
                              {d.notes ? ` · ${d.notes}` : ""}
                            </p>
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
              ) : (
                <div className="px-5 py-4 text-center">
                  <p className="text-xs text-gray-400 mb-2">No documents uploaded yet</p>
                  <button onClick={() => { setForm({ vehicle_id: v.id, doc_type: "insurance", file: null }); setOpen(true); }}
                    className="text-xs font-bold text-pink-600 hover:text-pink-700 underline">
                    Upload Insurance to start →
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-pink-500" /> Upload & AI Verify Document
            </DialogTitle>
          </DialogHeader>
          <div className="p-3 rounded-xl bg-violet-50 border border-violet-100 text-xs text-violet-700 mb-2">
            🤖 Our AI will automatically read this document, extract the expiry date and VIN, and verify authenticity. If insurance + registration are both valid, your vehicle will go live instantly.
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  {DOC_TYPES.map(dt => (
                    <SelectItem key={dt.key} value={dt.key}>
                      {dt.label} {dt.required ? "🔴 Required" : "⚪ Optional"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Upload File * (PDF, JPG, PNG)</label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" required onChange={e => setForm(p => ({ ...p, file: e.target.files[0] }))}
                className="w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-pink-50 file:text-pink-600 hover:file:bg-pink-100" />
              <p className="text-xs text-gray-400 mt-1">AI will extract expiry date — no need to enter it manually</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-500 bg-gray-100 hover:bg-gray-200">Cancel</button>
              <button type="submit" disabled={uploading || !form.vehicle_id || !form.file}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 flex items-center gap-2"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Sparkles className="h-4 w-4" /> Upload & Verify</>}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}