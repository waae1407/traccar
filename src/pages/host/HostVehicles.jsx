import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Car, CheckCircle2, Clock, MoreVertical, AlertTriangle, Shield, Zap } from "lucide-react";
import TelematicsAdminPanel from "@/components/admin/TelematicsAdminPanel";
import HostPageHeader from "@/components/host/HostPageHeader";
import VehicleFormDialog from "@/components/vehicles/VehicleFormDialog";
import { Link } from "react-router-dom";
import VehicleQualityCoaching from "@/components/host/reputation/VehicleQualityCoaching";
import { latestSnapshotFor } from "@/lib/reputation/publicTrust";

const statusColors = {
  Available: "text-emerald-600 bg-emerald-50",
  Booked: "text-blue-600 bg-blue-50",
  Maintenance: "text-yellow-600 bg-yellow-50",
  "Out of Service": "text-red-600 bg-red-50",
};

const approvalColors = {
  approved: "text-emerald-600 bg-emerald-50",
  pending: "text-yellow-600 bg-yellow-50",
  rejected: "text-red-600 bg-red-50",
};

export default function HostVehicles() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

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

  const { data: complianceDocs = [] } = useQuery({
    queryKey: ["host-compliance", host?.id],
    queryFn: () => base44.entities.HostVehicleCompliance.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: signalSnapshots = [] } = useQuery({
    queryKey: ["host-vehicle-quality-signals", host?.id],
    queryFn: () => base44.entities.ReputationSignalSnapshot.list("-created_date", 500),
    enabled: !!host?.id,
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Vehicle.update(editing.id, data)
      : base44.entities.Vehicle.create({ ...data, host_id: host.id, approval_status: "pending", status: "Out of Service", deployment_type: "human", telematics_provider: "none", av_platform: "none" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-vehicles"] }); setOpen(false); setEditing(null); },
  });

  const openEdit = (v) => { setEditing(v); setOpen(true); };
  const openNew = () => { setEditing(null); setOpen(true); };
  const activeForVehicle = (vid) => bookings.filter(b => b.vehicle_id === vid && ["active", "confirmed", "approved"].includes(b.booking_status));

  // Compute compliance status per vehicle
  const getVehicleComplianceStatus = (vehicleId) => {
    const vDocs = complianceDocs.filter(d => d.vehicle_id === vehicleId);
    const hasValidInsurance = vDocs.some(d => d.doc_type === "insurance" && ["valid", "expiring_soon"].includes(d.status));
    const hasValidRegistration = vDocs.some(d => d.doc_type === "registration" && ["valid", "expiring_soon"].includes(d.status));
    const hasPendingInsurance = vDocs.some(d => d.doc_type === "insurance" && d.status === "pending_review");
    const hasPendingRegistration = vDocs.some(d => d.doc_type === "registration" && d.status === "pending_review");
    if (hasValidInsurance && hasValidRegistration) return "complete";
    if (hasPendingInsurance || hasPendingRegistration) return "reviewing";
    return "missing";
  };

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="My Vehicles"
        subtitle={`${vehicles.length} vehicle${vehicles.length !== 1 ? "s" : ""} in your fleet`}
        action={
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            <Plus className="h-4 w-4" /> Add Vehicle
          </button>
        }
      />

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-48 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
            <Car className="h-7 w-7 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">No vehicles yet</h3>
          <p className="text-gray-400 text-sm mb-5">Add your first vehicle to start earning</p>
          <button onClick={openNew} className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>Add Your First Vehicle</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map(v => {
            const active = activeForVehicle(v.id);
            const complianceStatus = getVehicleComplianceStatus(v.id);
            const snapshot = latestSnapshotFor(signalSnapshots, "vehicle", v.id);
            return (
              <div key={v.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all hover:-translate-y-0.5">
                {v.image_url ? (
                  <img src={v.image_url} alt={`${v.make} ${v.model}`} className="w-full h-36 object-cover" />
                ) : (
                  <div className="w-full h-36 bg-gray-100 flex items-center justify-center">
                    <Car className="h-10 w-10 text-gray-300" />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-gray-900 text-sm">{v.year} {v.make} {v.model}</h3>
                      <p className="text-xs text-gray-400">{v.city}, {v.state}</p>
                    </div>
                    <button onClick={() => openEdit(v)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${statusColors[v.status] || "bg-gray-100 text-gray-500"}`}>{v.status}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${approvalColors[v.approval_status] || "bg-gray-100 text-gray-500"}`}>
                      {v.approval_status === "pending" ? "Pending Docs" : v.approval_status === "approved" ? "Approved" : "Rejected"}
                    </span>
                  </div>

                  {/* Compliance status */}
                  {complianceStatus === "missing" && (
                    <Link to="/host/compliance" className="flex items-center gap-2 w-full mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-all">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-amber-800">Upload Insurance & Registration</p>
                        <p className="text-[10px] text-amber-600">Required to go live</p>
                      </div>
                      <span className="text-[10px] font-bold text-amber-700 underline">Upload →</span>
                    </Link>
                  )}
                  {complianceStatus === "reviewing" && (
                    <div className="flex items-center gap-2 w-full mb-3 p-2.5 rounded-xl bg-blue-50 border border-blue-200">
                      <Clock className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 animate-pulse" />
                      <div>
                        <p className="text-xs font-bold text-blue-800">AI Reviewing Documents…</p>
                        <p className="text-[10px] text-blue-600">Vehicle will go live once verified</p>
                      </div>
                    </div>
                  )}
                  {complianceStatus === "complete" && v.approval_status === "approved" && (
                    <div className="flex items-center gap-2 w-full mb-3 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                      <Shield className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                      <p className="text-xs font-bold text-emerald-700">Compliance Verified ✓</p>
                    </div>
                  )}

                  <VehicleQualityCoaching vehicle={v} snapshot={snapshot} complianceStatus={complianceStatus} />

                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-emerald-600">${v.weekly_rate}/wk</span>
                    <div className="flex items-center gap-1.5">
                      {v.moovetrax_device_id && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">
                          <Zap className="h-2.5 w-2.5" /> MooveTrax
                        </span>
                      )}
                      {active.length > 0 ? (
                        <span className="flex items-center gap-1 text-xs text-blue-600"><CheckCircle2 className="h-3 w-3" /> {active.length} active</span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-gray-400"><Clock className="h-3 w-3" /> No rental</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <VehicleFormDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        onSave={(data) => saveMutation.mutate(data)}
        vehicle={editing}
        isSaving={saveMutation.isPending}
        requiredHostId={host?.id || ""}
      />
    </div>
  );
}