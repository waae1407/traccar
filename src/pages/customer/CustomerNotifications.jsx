import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Bell, BellOff, Check, CheckCheck, Archive, Search, ChevronLeft, ChevronRight, X, AlertTriangle, CreditCard, Car, Shield, MapPin, FileText, RotateCcw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORY_CONFIG = {
  bookings: { label: "Bookings", icon: Car, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  booking: { label: "Bookings", icon: Car, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  payments: { label: "Payments", icon: CreditCard, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  payment: { label: "Payments", icon: CreditCard, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  verification: { label: "Verification", icon: Shield, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
  contracts: { label: "Contracts", icon: FileText, color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
  refunds: { label: "Refunds", icon: RotateCcw, color: "text-teal-600", bg: "bg-teal-50 border-teal-200" },
  gps: { label: "GPS", icon: MapPin, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
  alert: { label: "Alerts", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
  system: { label: "System", icon: Bell, color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
};

const PAGE_SIZE = 20;

function NotificationCard({ notification, onMarkRead, onArchive }) {
  const cat = CATEGORY_CONFIG[notification.category] || CATEGORY_CONFIG[notification.type] || CATEGORY_CONFIG.system;
  const CatIcon = cat.icon;
  const isUnread = !notification.is_read;

  return (
    <div className={`relative flex gap-3 p-4 rounded-2xl border transition-all ${isUnread ? "bg-white border-primary/20 shadow-sm" : "bg-background/40 border-border/40"}`}>
      {isUnread && <div className="absolute left-0 top-4 w-1 h-8 rounded-r-full bg-primary" />}
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${cat.bg}`}>
        <CatIcon className={`h-5 w-5 ${cat.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${isUnread ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{notification.title}</p>
        {notification.body && <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">{notification.body}</p>}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground">
            {notification.created_date ? new Date(notification.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
          </span>
          {isUnread && <span className="text-[10px] font-bold text-primary">NEW</span>}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {isUnread && (
          <button onClick={() => onMarkRead(notification)} title="Mark as read" className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <Check className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
        <button onClick={() => onArchive(notification)} title="Archive" className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
          <Archive className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

export default function CustomerNotifications() {
  const { user } = useAuth();

  const { data: safetyEvents = [] } = useQuery({
    queryKey: ["customer-safety-events", user?.id],
    queryFn: () => base44.entities.TelematicsSafetyEvent.filter({ customer_id: user?.id, visible_to_customer: true }, "-first_seen_at", 50),
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);

  const { data: allNotifications = [], isLoading } = useQuery({
    queryKey: ["customer-notifications", user?.email],
    queryFn: () => base44.entities.Notification.filter({ user_email: user?.email }, "-created_date", 200),
    enabled: !!user?.email,
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (n) => base44.entities.Notification.update(n.id, { is_read: true, read_at: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-notifications", user?.email] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (n) => base44.entities.Notification.update(n.id, { is_archived: true, is_read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-notifications", user?.email] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = allNotifications.filter(n => !n.is_read && !n.is_archived);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { is_read: true, read_at: new Date().toISOString() })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["customer-notifications", user?.email] }),
  });

  const filtered = allNotifications.filter(n => {
    if (!showArchived && n.is_archived) return false;
    if (showArchived && !n.is_archived) return false;
    if (filterCategory !== "all" && n.category !== filterCategory && n.type !== filterCategory) return false;
    if (search) {
      const q = search.toLowerCase();
      return (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q);
    }
    return true;
  });

  const unreadCount = allNotifications.filter(n => !n.is_read && !n.is_archived).length;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [search, filterCategory, showArchived]);

  const categories = ["all", "bookings", "payments", "verification", "contracts", "refunds", "gps"];

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-foreground">Notifications</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unreadCount > 0 ? <span className="text-primary font-semibold">{unreadCount} unread</span> : "All caught up"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllReadMutation.mutate()} disabled={markAllReadMutation.isPending} className="gap-1.5 text-xs">
              <CheckCheck className="h-3.5 w-3.5" />
              Mark All Read
            </Button>
          )}
          <button onClick={() => setShowArchived(!showArchived)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${showArchived ? "bg-secondary text-foreground border-border" : "border-border text-muted-foreground"}`}>
            {showArchived ? "Active" : "Archived"}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9" />
        {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground" /></button>}
      </div>

      {safetyEvents.filter(e => e.is_active).length > 0 && (
        <div className="space-y-2 mb-4">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Alerts</h2>
          {safetyEvents.filter(e => e.is_active).map(event => (
            <div key={event.id} className="relative flex flex-col gap-3 p-4 rounded-2xl border bg-red-50/50 border-red-200">
              <div className="flex gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border bg-red-100 border-red-200">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-red-900 leading-snug">{event.alert_title}</p>
                  <p className="text-xs text-red-700 leading-relaxed mt-0.5 line-clamp-2">{event.alert_message}</p>
                  <p className="text-[10px] text-red-600/70 mt-1">
                    {new Date(event.first_seen_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1 text-xs border-red-200 text-red-700 hover:bg-red-50">Call Support</Button>
                <Button size="sm" variant="outline" className="flex-1 text-xs border-red-200 text-red-700 hover:bg-red-50">Mark Safe</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {categories.map(cat => {
          const cfg = CATEGORY_CONFIG[cat];
          const isActive = filterCategory === cat;
          return (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isActive ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground bg-background"}`}>
              {cat === "all" ? "All" : (cfg?.label || cat)}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : paginated.length === 0 ? (
        <div className="text-center py-12">
          <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <BellOff className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-foreground mb-1">No notifications</h3>
          <p className="text-sm text-muted-foreground">Nothing to show here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {paginated.map(n => (
            <NotificationCard key={n.id} notification={n} onMarkRead={markReadMutation.mutate} onArchive={archiveMutation.mutate} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}