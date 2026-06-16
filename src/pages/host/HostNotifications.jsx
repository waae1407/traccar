import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Bell, BellOff, Check, CheckCheck, Archive, Search, Filter, ChevronLeft, ChevronRight, X, AlertTriangle, CreditCard, DollarSign, MapPin, Shield, Wrench, Package, Calendar, Info, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORY_CONFIG = {
  bookings: { label: "Bookings", icon: Calendar, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  payments: { label: "Payments", icon: CreditCard, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  payouts: { label: "Payouts", icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  gps: { label: "GPS", icon: MapPin, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
  compliance: { label: "Compliance", icon: Shield, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  maintenance: { label: "Maintenance", icon: Wrench, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" },
  subscriptions: { label: "Subscriptions", icon: Package, color: "text-pink-600", bg: "bg-pink-50 border-pink-200" },
  alert: { label: "Alerts", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 border-red-200" },
  payment: { label: "Payments", icon: CreditCard, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  booking: { label: "Bookings", icon: Calendar, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  system: { label: "System", icon: Info, color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
};

const SEVERITY_CONFIG = {
  critical: { label: "Critical", dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
  warning: { label: "Warning", dot: "bg-yellow-500", text: "text-yellow-700", bg: "bg-yellow-50" },
  info: { label: "Info", dot: "bg-blue-400", text: "text-blue-700", bg: "bg-blue-50" },
};

const PAGE_SIZE = 20;

function NotificationCard({ notification, onMarkRead, onArchive }) {
  const cat = CATEGORY_CONFIG[notification.category] || CATEGORY_CONFIG[notification.type] || CATEGORY_CONFIG.system;
  const CategoryIcon = cat.icon;
  const isUnread = !notification.is_read;
  const severity = SEVERITY_CONFIG[notification.severity];

  return (
    <div className={`relative flex gap-3 p-4 rounded-2xl border transition-all ${isUnread ? "bg-white border-primary/20 shadow-sm" : "bg-background/50 border-border/50"}`}>
      {isUnread && <div className="absolute left-0 top-4 w-1 h-8 rounded-r-full bg-primary" />}
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${cat.bg}`}>
        <CategoryIcon className={`h-5 w-5 ${cat.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-0.5">
          <p className={`text-sm leading-snug ${isUnread ? "font-bold text-foreground" : "font-medium text-muted-foreground"}`}>{notification.title}</p>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {severity && <span className={`h-1.5 w-1.5 rounded-full ${severity.dot}`} />}
            <button onClick={() => onMarkRead(notification)} className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-secondary transition-all">
              <Check className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
        {notification.body && <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{notification.body}</p>}
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground">
            {notification.created_date ? new Date(notification.created_date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
          </span>
          {notification.category && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cat.bg} ${cat.color}`}>
              {cat.label}
            </span>
          )}
          {isUnread && <span className="text-[10px] font-bold text-primary">NEW</span>}
        </div>
      </div>
      <div className="flex flex-col gap-1 ml-1 opacity-0 hover:opacity-100 transition-opacity" style={{ opacity: 1 }}>
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

export default function HostNotifications() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);

  // Fetch host profile to ensure data isolation
  const { data: hosts = [] } = useQuery({
    queryKey: ["host-profile-notif", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  // Fetch all notifications for this host's email — isolated to this user
  const { data: allNotifications = [], isLoading } = useQuery({
    queryKey: ["host-notifications", user?.email],
    queryFn: () => base44.entities.Notification.filter({ user_email: user?.email }, "-created_date", 200),
    enabled: !!user?.email,
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (notification) => base44.entities.Notification.update(notification.id, { is_read: true, read_at: new Date().toISOString() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["host-notifications", user?.email] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (notification) => base44.entities.Notification.update(notification.id, { is_archived: true, is_read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["host-notifications", user?.email] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = allNotifications.filter(n => !n.is_read && !n.is_archived);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { is_read: true, read_at: new Date().toISOString() })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["host-notifications", user?.email] }),
  });

  // Filter logic
  const filtered = allNotifications.filter(n => {
    if (!showArchived && n.is_archived) return false;
    if (showArchived && !n.is_archived) return false;
    if (filterCategory !== "all" && n.category !== filterCategory && n.type !== filterCategory) return false;
    if (filterSeverity !== "all" && n.severity !== filterSeverity) return false;
    if (search) {
      const q = search.toLowerCase();
      return (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q);
    }
    return true;
  });

  const unreadCount = allNotifications.filter(n => !n.is_read && !n.is_archived).length;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, filterCategory, filterSeverity, showArchived]);

  const categories = ["all", "bookings", "payments", "payouts", "gps", "compliance", "maintenance", "subscriptions"];

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
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
          <button onClick={() => setShowArchived(!showArchived)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${showArchived ? "bg-secondary text-foreground border-border" : "border-border text-muted-foreground hover:text-foreground"}`}>
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? "Active" : "Archived"}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notifications..." className="pl-9" />
        {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-muted-foreground" /></button>}
      </div>

      {/* Category Filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {categories.map(cat => {
          const cfg = CATEGORY_CONFIG[cat];
          const isActive = filterCategory === cat;
          return (
            <button key={cat} onClick={() => setFilterCategory(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isActive ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground bg-background"}`}>
              {cat === "all" ? "All" : (cfg?.label || cat)}
            </button>
          );
        })}
      </div>

      {/* Severity Filter */}
      <div className="flex gap-2">
        {["all", "critical", "warning", "info"].map(sev => {
          const cfg = SEVERITY_CONFIG[sev];
          const isActive = filterSeverity === sev;
          return (
            <button key={sev} onClick={() => setFilterSeverity(sev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${isActive ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground bg-background"}`}>
              {sev !== "all" && <span className={`h-1.5 w-1.5 rounded-full ${cfg?.dot || "bg-gray-400"}`} />}
              {sev === "all" ? "All Severity" : cfg?.label || sev}
            </button>
          );
        })}
      </div>

      {/* Notification List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : paginated.length === 0 ? (
        <div className="text-center py-16">
          <div className="h-14 w-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <BellOff className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="font-bold text-foreground mb-1">{showArchived ? "No archived notifications" : "You're all caught up"}</h3>
          <p className="text-sm text-muted-foreground">{showArchived ? "Nothing archived yet." : "No notifications match your filters."}</p>
        </div>
      ) : (
        <div className="space-y-2 group">
          {paginated.map(n => (
            <NotificationCard
              key={n.id}
              notification={n}
              onMarkRead={markReadMutation.mutate}
              onArchive={archiveMutation.mutate}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">{filtered.length} total · Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}