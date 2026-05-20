import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Activity, Search, Filter, Clock, User, Car, DollarSign, Shield, Zap, AlertTriangle, CheckCircle2, Building2, Wrench, ChevronDown, ChevronRight } from "lucide-react";
import { format } from "date-fns";

const EVENT_CATEGORIES = {
  payment: { label: "Payment", color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30", icon: DollarSign, prefixes: ["payment.", "payment_received", "payment_submitted"] },
  booking: { label: "Booking", color: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/30", icon: CheckCircle2, prefixes: ["booking.", "booking_confirmed", "booking_active", "booking_completed", "booking_started"] },
  host: { label: "Host", color: "text-violet-400", bg: "bg-violet-500/20 border-violet-500/30", icon: Building2, prefixes: ["host."] },
  vehicle: { label: "Vehicle", color: "text-cyan-400", bg: "bg-cyan-500/20 border-cyan-500/30", icon: Car, prefixes: ["vehicle."] },
  gps: { label: "GPS", color: "text-orange-400", bg: "bg-orange-500/20 border-orange-500/30", icon: Zap, prefixes: ["gps."] },
  dispute: { label: "Dispute", color: "text-red-400", bg: "bg-red-500/20 border-red-500/30", icon: AlertTriangle, prefixes: ["dispute."] },
  payout: { label: "Payout", color: "text-pink-400", bg: "bg-pink-500/20 border-pink-500/30", icon: DollarSign, prefixes: ["payout."] },
  compliance: { label: "Compliance", color: "text-yellow-400", bg: "bg-yellow-500/20 border-yellow-500/30", icon: Shield, prefixes: ["compliance."] },
  admin: { label: "Admin", color: "text-gray-300", bg: "bg-gray-500/20 border-gray-500/30", icon: User, prefixes: ["admin."] },
};

function getEventCategory(eventType) {
  for (const [key, cat] of Object.entries(EVENT_CATEGORIES)) {
    if (cat.prefixes.some(p => eventType?.startsWith(p))) return { key, ...cat };
  }
  return { key: "other", label: "System", color: "text-muted-foreground", bg: "bg-muted/30 border-border", icon: Activity };
}

const ROLE_COLORS = {
  admin: "text-red-400 bg-red-500/15",
  host: "text-violet-400 bg-violet-500/15",
  customer: "text-blue-400 bg-blue-500/15",
  automation: "text-yellow-400 bg-yellow-500/15",
  system: "text-gray-400 bg-gray-500/15",
  stripe: "text-emerald-400 bg-emerald-500/15",
};

function EventRow({ event }) {
  const [expanded, setExpanded] = useState(false);
  const cat = getEventCategory(event.event_type);
  const Icon = cat.icon;
  const roleColor = ROLE_COLORS[event.actor_role] || "text-muted-foreground bg-muted/20";

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-4 py-3 hover:bg-muted/20 transition-colors flex items-center gap-3"
      >
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${cat.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${cat.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${cat.bg} ${cat.color}`}>
              {event.event_type}
            </span>
            {event.actor_role && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${roleColor}`}>
                {event.actor_role}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground leading-tight truncate">
            {event.summary || event.event_title || event.event_type}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {event.actor_email && <span className="mr-2">{event.actor_email}</span>}
            <Clock className="h-2.5 w-2.5 inline mr-1" />
            {event.created_date ? format(new Date(event.created_date), "MMM d, yyyy h:mm a") : "—"}
          </p>
        </div>
        {(event.booking_id || event.vehicle_id || event.host_id) && (
          <div className="flex gap-1 flex-shrink-0">
            {event.booking_id && <span className="text-[9px] text-muted-foreground border border-border/50 rounded px-1 py-0.5">BK</span>}
            {event.vehicle_id && <span className="text-[9px] text-muted-foreground border border-border/50 rounded px-1 py-0.5">VH</span>}
            {event.host_id && <span className="text-[9px] text-muted-foreground border border-border/50 rounded px-1 py-0.5">HT</span>}
          </div>
        )}
        {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-3 ml-10 space-y-2 text-xs text-muted-foreground">
          {event.booking_id && <div><span className="text-foreground/60 font-semibold">Booking ID:</span> {event.booking_id}</div>}
          {event.vehicle_id && <div><span className="text-foreground/60 font-semibold">Vehicle ID:</span> {event.vehicle_id}</div>}
          {event.host_id && <div><span className="text-foreground/60 font-semibold">Host ID:</span> {event.host_id}</div>}
          {event.customer_id && <div><span className="text-foreground/60 font-semibold">Customer:</span> {event.customer_id}</div>}
          {event.target_entity && <div><span className="text-foreground/60 font-semibold">Target:</span> {event.target_entity} {event.target_id && `— ${event.target_id}`}</div>}
          {event.metadata && Object.keys(event.metadata).length > 0 && (
            <div>
              <span className="text-foreground/60 font-semibold">Metadata:</span>
              <pre className="mt-1 text-[10px] bg-muted/30 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            </div>
          )}
          <div><span className="text-foreground/60 font-semibold">Source:</span> {event.source || "—"}</div>
        </div>
      )}
    </div>
  );
}

export default function AdminAuditLog() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["audit-log", categoryFilter, roleFilter, dateFrom, dateTo, page],
    queryFn: () => base44.entities.ActivityEvent.list("-created_date", PAGE_SIZE, page * PAGE_SIZE),
    staleTime: 30_000,
  });

  const filtered = events.filter(e => {
    if (categoryFilter !== "all") {
      const cat = EVENT_CATEGORIES[categoryFilter];
      if (cat && !cat.prefixes.some(p => e.event_type?.startsWith(p))) return false;
    }
    if (roleFilter !== "all" && e.actor_role !== roleFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.summary?.toLowerCase().includes(q) && !e.actor_email?.toLowerCase().includes(q) && !e.event_type?.toLowerCase().includes(q)) return false;
    }
    if (dateFrom && e.created_date && e.created_date < dateFrom) return false;
    if (dateTo && e.created_date && e.created_date > dateTo + "T23:59:59") return false;
    return true;
  });

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div>
        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Admin Operations</p>
        <h1 className="text-xl font-black text-foreground" style={{ fontFamily: "var(--font-syne)" }}>Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Platform-wide event history — all actions, all actors.</p>
      </div>

      {/* Filters */}
      <div className="glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">Filters</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(0); }}
            className="w-full h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
          >
            <option value="all">All Categories</option>
            {Object.entries(EVENT_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(0); }}
            className="w-full h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
          >
            <option value="all">All Actors</option>
            {["admin", "host", "customer", "automation", "system", "stripe"].map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="w-full h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
            placeholder="From date"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="w-full h-9 px-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground focus:outline-none focus:border-primary"
            placeholder="To date"
          />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by summary, actor, or event type..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-muted/40 border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Results */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">
            {isLoading ? "Loading..." : `${filtered.length} events`}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="text-xs px-2 py-1 rounded bg-muted/40 text-foreground disabled:opacity-40 hover:bg-muted/60"
            >
              ← Prev
            </button>
            <span className="text-xs text-muted-foreground">Page {page + 1}</span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={events.length < PAGE_SIZE}
              className="text-xs px-2 py-1 rounded bg-muted/40 text-foreground disabled:opacity-40 hover:bg-muted/60"
            >
              Next →
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Activity className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No audit events found</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Events appear here as platform actions occur</p>
          </div>
        ) : (
          <div>
            {filtered.map(event => (
              <EventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}