import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Users, Search, ChevronRight, Phone, Mail, DollarSign, Calendar } from "lucide-react";
import HostPageHeader from "@/components/host/HostPageHeader";
import { format } from "date-fns";

const STATUS_STYLE = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-100 text-gray-500 border-gray-200",
  blocked: "bg-red-50 text-red-600 border-red-200",
};

export default function HostCRM() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");

  const { data: hosts = [] } = useQuery({ queryKey: ["my-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user?.email }), enabled: !!user?.email });
  const host = hosts[0];

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["host-customers", host?.id],
    queryFn: () => base44.entities.HostCustomer.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["host-vehicles-crm", host?.id],
    queryFn: () => base44.entities.Vehicle.filter({ host_id: host.id }),
    enabled: !!host?.id,
  });

  const vehicleIds = new Set(vehicles.map(v => v.id));

  const { data: allBookings = [] } = useQuery({
    queryKey: ["host-bookings-crm", host?.id, vehicles.length],
    queryFn: async () => {
      if (vehicles.length === 0) return [];
      const all = await base44.entities.BookingRequest.list("-created_date", 200);
      return all.filter(b => vehicleIds.has(b.vehicle_id));
    },
    enabled: !!host?.id && vehicles.length >= 0,
  });

  const bookings = allBookings;

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.HostCustomer.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["host-customers"] }); setNote(""); },
  });

  const filtered = customers.filter(c =>
    !search || `${c.full_name} ${c.email} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  );

  const customerBookings = selected ? bookings.filter(b => b.user_email === selected.email) : [];

  const thisMonth = customers.filter(c => {
    if (!c.created_date) return false;
    const d = new Date(c.created_date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });

  return (
    <div className="space-y-5">
      <HostPageHeader
        title="Customers"
        subtitle={`${customers.length} total · ${thisMonth.length} new this month`}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 text-center hover:shadow-md transition-shadow">
          <p className="text-2xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>{customers.length}</p>
          <p className="text-xs text-gray-400 mt-1">Total Customers</p>
        </div>
        <div className="rounded-3xl shadow-sm p-4 text-center" style={{ background: "linear-gradient(135deg, hsl(152 60% 46% / 0.1), hsl(199 90% 54% / 0.06))", border: "1px solid hsl(152 60% 46% / 0.18)" }}>
          <p className="text-2xl font-black text-emerald-600" style={{ fontFamily: "var(--font-syne)" }}>{customers.filter(c => c.customer_status === "active").length}</p>
          <p className="text-xs text-gray-400 mt-1">Active</p>
        </div>
        <div className="rounded-3xl shadow-sm p-4 text-center" style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.08), hsl(265 80% 62% / 0.05))", border: "1px solid hsl(338 90% 56% / 0.15)" }}>
          <p className="text-2xl font-black text-pink-600" style={{ fontFamily: "var(--font-syne)" }}>${customers.reduce((s, c) => s + (c.total_spent || 0), 0).toLocaleString()}</p>
          <p className="text-xs text-gray-400 mt-1">Total Revenue</p>
        </div>
      </div>

      <div className="flex gap-4">
        {/* List */}
        <div className="flex-1 min-w-0">
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-pink-400"
              placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-5 space-y-3">{[1,2,3].map(i => <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <Users className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">No customers yet</p>
                <p className="text-gray-300 text-xs mt-1">Customers sync automatically from bookings</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <button key={c.id} onClick={() => setSelected(selected?.id === c.id ? null : c)}
                    className={`w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-all text-left ${selected?.id === c.id ? "bg-pink-50" : ""}`}>
                    <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                      {c.full_name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{c.full_name}</p>
                      <p className="text-xs text-gray-400 truncate">{c.email}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-emerald-600">${(c.total_spent || 0).toLocaleString()}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[c.customer_status] || STATUS_STYLE.active}`}>
                        {c.customer_status}
                      </span>
                    </div>
                    <ChevronRight className={`h-4 w-4 text-gray-300 flex-shrink-0 transition-transform ${selected?.id === c.id ? "rotate-90" : ""}`} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-72 flex-shrink-0 space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-full flex items-center justify-center text-base font-bold text-white"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  {selected.full_name?.charAt(0) || "?"}
                </div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">{selected.full_name}</p>
                  <p className="text-xs text-gray-400">{selected.booking_count} booking{selected.booking_count !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {selected.phone && <div className="flex items-center gap-2 text-gray-600"><Phone className="h-3.5 w-3.5 text-gray-400" />{selected.phone}</div>}
                {selected.email && <div className="flex items-center gap-2 text-gray-600"><Mail className="h-3.5 w-3.5 text-gray-400" />{selected.email}</div>}
                <div className="flex items-center gap-2 text-gray-600"><DollarSign className="h-3.5 w-3.5 text-gray-400" />${(selected.total_spent || 0).toLocaleString()} total spent</div>
                {selected.last_booking_date && <div className="flex items-center gap-2 text-gray-600"><Calendar className="h-3.5 w-3.5 text-gray-400" />Last: {selected.last_booking_date}</div>}
              </div>
              <div className="mt-4">
                <select className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none mb-3"
                  value={selected.customer_status || "active"}
                  onChange={e => updateMutation.mutate({ id: selected.id, data: { customer_status: e.target.value } })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="blocked">Blocked</option>
                </select>
                <textarea rows={2} className="w-full px-3 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs text-gray-700 focus:outline-none focus:border-pink-400 resize-none"
                  placeholder="Add note…" value={note || selected.notes || ""}
                  onChange={e => setNote(e.target.value)} />
                <button onClick={() => updateMutation.mutate({ id: selected.id, data: { notes: note } })}
                  className="w-full mt-2 py-2 rounded-xl text-xs font-bold text-white"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  Save Note
                </button>
              </div>
            </div>

            {customerBookings.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Booking History</p>
                <div className="space-y-2">
                  {customerBookings.slice(0, 5).map(b => (
                    <div key={b.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 truncate mr-2">{b.vehicle_name}</span>
                      <span className="text-gray-400 flex-shrink-0">{b.start_date}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}