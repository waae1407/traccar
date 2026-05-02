import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Car, CheckCircle2, Clock, AlertTriangle, MoreVertical } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const inputClass = "w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-primary/50 text-sm";

const statusColors = {
  Available: "bg-green-500/20 text-green-400",
  Booked: "bg-blue-500/20 text-blue-400",
  Maintenance: "bg-yellow-500/20 text-yellow-400",
  "Out of Service": "bg-red-500/20 text-red-400",
};

const approvalColors = {
  approved: "bg-green-500/20 text-green-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  rejected: "bg-red-500/20 text-red-400",
};

export default function HostVehicles() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ make: "", model: "", year: "", color: "", city: "", state: "", weekly_rate: "", mileage: "", vin: "", plate: "", rent_to_own_eligible: false, pickup_address: "", pickup_hours: "" });

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ["host-vehicles", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["host-bookings-all", host?.id],
    queryFn: () => base44.entities.BookingRequest.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing ? base44.entities.Vehicle.update(editing.id, data) : base44.entities.Vehicle.create({ ...data, host_id: host.id, approval_status: "pending", deployment_type: "human", telematics_provider: "none", av_platform: "none" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-vehicles"] }); setOpen(false); setEditing(null); },
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const openEdit = (v) => { setEditing(v); setForm({ ...v }); setOpen(true); };
  const openNew = () => { setEditing(null); setForm({ make: "", model: "", year: "", color: "", city: "", state: "", weekly_rate: "", mileage: "", vin: "", plate: "", rent_to_own_eligible: false, pickup_address: "", pickup_hours: "" }); setOpen(true); };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate({ ...form, year: Number(form.year), weekly_rate: Number(form.weekly_rate), mileage: Number(form.mileage) });
  };

  const activeForVehicle = (vid) => bookings.filter(b => b.vehicle_id === vid && ["active", "confirmed", "approved"].includes(b.booking_status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white font-syne">My Vehicles</h1>
          <p className="text-white/40 text-sm mt-1">{vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""} in your fleet</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white gradient-primary hover:opacity-90 transition-all">
          <Plus className="h-4 w-4" /> Add Vehicle
        </button>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-48 rounded-2xl bg-white/[0.04] animate-pulse" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="text-center py-20">
          <Car className="h-12 w-12 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-white mb-2">No vehicles yet</h3>
          <p className="text-white/40 text-sm mb-6">Add your first vehicle to start earning</p>
          <button onClick={openNew} className="px-6 py-3 rounded-xl text-sm font-bold text-white gradient-primary">Add Your First Vehicle</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map(v => {
            const active = activeForVehicle(v.id);
            return (
              <div key={v.id} className="rounded-2xl border border-white/[0.08] glass overflow-hidden">
                {v.image_url ? (
                  <img src={v.image_url} alt={`${v.make} ${v.model}`} className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-white/[0.04] flex items-center justify-center">
                    <Car className="h-10 w-10 text-white/20" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-white">{v.year} {v.make} {v.model}</h3>
                      <p className="text-xs text-white/40">{v.city}, {v.state}</p>
                    </div>
                    <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColors[v.status] || "bg-white/10 text-white/60"}`}>{v.status}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${approvalColors[v.approval_status] || "bg-white/10 text-white/60"}`}>
                      {v.approval_status === "pending" ? "Pending Approval" : v.approval_status === "approved" ? "Approved" : "Rejected"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-green-400">${v.weekly_rate}/wk</span>
                    {active.length > 0 ? (
                      <span className="flex items-center gap-1 text-xs text-blue-400"><CheckCircle2 className="h-3 w-3" /> {active.length} active rental</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-white/30"><Clock className="h-3 w-3" /> No active rental</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto border-white/[0.08] text-white" style={{ background: "hsl(222 28% 9%)" }}>
          <DialogHeader>
            <DialogTitle className="font-syne text-white">{editing ? "Edit Vehicle" : "Add Vehicle"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="block text-xs text-white/40 mb-1.5">Make *</label><input className={inputClass} required value={form.make} onChange={e => set("make", e.target.value)} /></div>
              <div><label className="block text-xs text-white/40 mb-1.5">Model *</label><input className={inputClass} required value={form.model} onChange={e => set("model", e.target.value)} /></div>
              <div><label className="block text-xs text-white/40 mb-1.5">Year *</label><input className={inputClass} required type="number" value={form.year} onChange={e => set("year", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-white/40 mb-1.5">Color</label><input className={inputClass} value={form.color} onChange={e => set("color", e.target.value)} /></div>
              <div><label className="block text-xs text-white/40 mb-1.5">Weekly Rate ($) *</label><input className={inputClass} required type="number" value={form.weekly_rate} onChange={e => set("weekly_rate", e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-white/40 mb-1.5">City *</label><input className={inputClass} required value={form.city} onChange={e => set("city", e.target.value)} /></div>
              <div><label className="block text-xs text-white/40 mb-1.5">State *</label><input className={inputClass} required value={form.state} onChange={e => set("state", e.target.value)} maxLength={2} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-white/40 mb-1.5">VIN</label><input className={inputClass} value={form.vin} onChange={e => set("vin", e.target.value)} /></div>
              <div><label className="block text-xs text-white/40 mb-1.5">Plate</label><input className={inputClass} value={form.plate} onChange={e => set("plate", e.target.value)} /></div>
            </div>
            <div><label className="block text-xs text-white/40 mb-1.5">Pickup Address</label><input className={inputClass} value={form.pickup_address} onChange={e => set("pickup_address", e.target.value)} placeholder="1234 Main St, Houston TX 77001" /></div>
            <div><label className="block text-xs text-white/40 mb-1.5">Pickup Hours</label><input className={inputClass} value={form.pickup_hours} onChange={e => set("pickup_hours", e.target.value)} placeholder="Mon–Fri 9am–5pm" /></div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <button type="button" onClick={() => set("rent_to_own_eligible", !form.rent_to_own_eligible)}
                className={`relative h-5 w-9 rounded-full transition-all ${form.rent_to_own_eligible ? "bg-primary" : "bg-white/10"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${form.rent_to_own_eligible ? "left-4" : "left-0.5"}`} />
              </button>
              <span className="text-sm text-white/60">Rent-to-Own Eligible</span>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-xl text-sm text-white/60 bg-white/[0.06] border border-white/[0.08]">Cancel</button>
              <button type="submit" disabled={saveMutation.isPending} className="px-4 py-2 rounded-xl text-sm font-bold text-white gradient-primary disabled:opacity-50">
                {saveMutation.isPending ? "Saving..." : editing ? "Update" : "Add Vehicle"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}