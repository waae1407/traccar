import React from "react";
import { Car, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

function labelVehicle(vehicle) {
  return vehicle?.display_name || [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || vehicle?.vehicle_name || "Vehicle";
}

export default function VehicleSelectorPanel({ mode, vehicles = [], selectedVehicleId, onSelect, booking }) {
  const [query, setQuery] = React.useState("");
  const filtered = vehicles.filter((vehicle) => `${labelVehicle(vehicle)} ${vehicle.vin || ""} ${vehicle.plate || ""}`.toLowerCase().includes(query.toLowerCase()));

  if (mode === "customer") {
    return (
      <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Rental Vehicle</p>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-950">{booking?.vehicle_name || labelVehicle(vehicles[0])}</h2>
            <p className="mt-1 text-sm text-slate-500">Access is tied to your active paid rental and expires when the rental ends.</p>
          </div>
          <Badge className="rounded-full bg-emerald-50 text-emerald-700">Active access</Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">Vehicle Selector</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">{mode === "admin" ? "All connected vehicles" : "My connected vehicles"}</h2>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vehicle, VIN, plate..." className="pl-9" />
        </div>
      </div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {filtered.map((vehicle) => {
          const active = vehicle.id === selectedVehicleId;
          return (
            <button key={vehicle.id} onClick={() => onSelect(vehicle.id)} className={`min-w-[220px] rounded-2xl border p-3 text-left transition ${active ? "border-pink-400 bg-pink-50 shadow-sm" : "border-slate-200 bg-slate-50 hover:bg-white"}`}>
              <Car className={`mb-2 h-4 w-4 ${active ? "text-pink-600" : "text-slate-400"}`} />
              <p className="truncate text-sm font-black text-slate-950">{labelVehicle(vehicle)}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{vehicle.status || "Connected"}</p>
            </button>
          );
        })}
        {filtered.length === 0 && <p className="py-6 text-sm text-slate-500">No vehicles found.</p>}
      </div>
    </div>
  );
}