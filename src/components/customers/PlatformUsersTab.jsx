import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Mail, Phone, CalendarDays, CheckCircle2, XCircle, Bell, BellOff, Search } from "lucide-react";

const FILTER_OPTIONS = ["All", "No Booking Yet", "Has Booking"];

export default function PlatformUsersTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["platform-users"],
    queryFn: () => base44.entities.User.list("-created_date", 200),
  });

  const { data: bookingRequests = [] } = useQuery({
    queryKey: ["booking-requests-admin-leads"],
    queryFn: () => base44.entities.BookingRequest.list("-created_date", 500),
  });

  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ["lead-follow-ups"],
    queryFn: () => base44.entities.LeadFollowUp.list("-created_date", 200),
  });

  const updateLeadMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeadFollowUp.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead-follow-ups"] }),
  });

  // Index bookings and leads by email for fast lookup
  const bookedEmails = new Set(
    bookingRequests
      .filter(b => !["draft", "cancelled"].includes(b.booking_status))
      .map(b => b.user_email)
      .filter(Boolean)
  );

  const leadByEmail = leads.reduce((acc, l) => { acc[l.user_email] = l; return acc; }, {});

  const nonAdminUsers = users.filter(u => u.role !== "admin");

  const filtered = nonAdminUsers.filter(u => {
    const hasBooking = bookedEmails.has(u.email);
    if (filter === "No Booking Yet" && hasBooking) return false;
    if (filter === "Has Booking" && !hasBooking) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${u.full_name} ${u.email}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const noBookingCount = nonAdminUsers.filter(u => !bookedEmails.has(u.email)).length;

  const toggleSubscription = (lead) => {
    if (!lead) return;
    updateLeadMutation.mutate({
      id: lead.id,
      data: {
        subscribed: !lead.subscribed,
        ...(lead.subscribed ? { unsubscribed_at: new Date().toISOString() } : { unsubscribed_at: null }),
      },
    });
  };

  if (loadingUsers || loadingLeads) {
    return (
      <div className="space-y-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "hsl(222 24% 11%)" }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary chips */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="px-3 py-1.5 rounded-xl text-xs font-bold border border-white/10 text-white/60" style={{ background: "hsl(222 24% 11%)" }}>
          {nonAdminUsers.length} total accounts
        </div>
        <div className="px-3 py-1.5 rounded-xl text-xs font-bold border border-yellow-500/30 text-yellow-400" style={{ background: "hsl(38 95% 54% / 0.08)" }}>
          {noBookingCount} never booked
        </div>
        <div className="px-3 py-1.5 rounded-xl text-xs font-bold border border-green-500/30 text-green-400" style={{ background: "hsl(152 60% 46% / 0.08)" }}>
          {nonAdminUsers.length - noBookingCount} have bookings
        </div>
        <div className="px-3 py-1.5 rounded-xl text-xs font-bold border border-primary/30 text-primary" style={{ background: "hsl(338 90% 56% / 0.08)" }}>
          {leads.filter(l => l.subscribed).length} on follow-up list
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full h-9 pl-9 pr-3 rounded-xl text-sm text-white placeholder-white/30 border border-white/10 outline-none focus:border-primary/50 transition-colors"
            style={{ background: "hsl(222 24% 11%)" }}
          />
        </div>
        <div className="flex gap-1.5">
          {FILTER_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filter === opt ? "text-white" : "text-white/40 border border-white/10"}`}
              style={filter === opt ? { background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" } : { background: "hsl(222 24% 11%)" }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* User list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-white/30 text-sm">No users found</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(u => {
            const hasBooking = bookedEmails.has(u.email);
            const lead = leadByEmail[u.email];
            const booking = bookingRequests.find(b => b.user_email === u.email && !["draft", "cancelled"].includes(b.booking_status));

            return (
              <div key={u.id} className="flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] hover:border-white/[0.12] transition-colors"
                style={{ background: "hsl(222 24% 11%)" }}>
                {/* Avatar */}
                <div className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  {u.full_name?.charAt(0) || "?"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-white text-sm">{u.full_name || "—"}</p>
                    {hasBooking ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-500/30 text-green-400" style={{ background: "hsl(152 60% 46% / 0.12)" }}>
                        {booking?.booking_status?.replace(/_/g, " ") || "booked"}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-yellow-500/30 text-yellow-400" style={{ background: "hsl(38 95% 54% / 0.10)" }}>
                        no booking
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-white/40">
                      <Mail className="h-3 w-3" />{u.email}
                    </span>
                    {u.phone && (
                      <span className="flex items-center gap-1 text-xs text-white/40">
                        <Phone className="h-3 w-3" />{u.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-white/30">
                      <CalendarDays className="h-3 w-3" />
                      {u.created_date ? format(new Date(u.created_date), "MMM d, yyyy") : "—"}
                    </span>
                  </div>
                </div>

                {/* Follow-up status */}
                {lead ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] text-white/30 uppercase tracking-wider">Follow-up</p>
                      <p className="text-xs text-white/50">
                        {lead.follow_up_count || 0} sent
                        {lead.last_contacted_at ? ` · last ${format(new Date(lead.last_contacted_at), "MMM d")}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleSubscription(lead)}
                      disabled={updateLeadMutation.isPending}
                      title={lead.subscribed ? "Unsubscribe from follow-ups" : "Re-subscribe to follow-ups"}
                      className={`h-8 w-8 rounded-lg flex items-center justify-center transition-colors border ${lead.subscribed ? "border-primary/30 text-primary" : "border-white/10 text-white/30"}`}
                      style={{ background: lead.subscribed ? "hsl(338 90% 56% / 0.12)" : "hsl(222 24% 13%)" }}
                    >
                      {lead.subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-white/20 flex-shrink-0">not enrolled</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}