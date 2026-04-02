import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bell, X, CheckCheck } from "lucide-react";
import { format } from "date-fns";

const typeColors = {
  booking: "bg-blue-50 text-blue-600",
  payment: "bg-green-50 text-green-600",
  verification: "bg-purple-50 text-purple-600",
  contract: "bg-indigo-50 text-indigo-600",
  alert: "bg-red-50 text-red-600",
  system: "bg-gray-50 text-gray-600",
};

export default function NotificationsPanel({ user }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", user?.email],
    queryFn: () => base44.entities.Notification.filter({ user_email: user?.email }),
    enabled: !!user?.email,
    staleTime: 30_000,
  });

  const unread = notifications.filter((n) => !n.read_status);

  const markRead = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { read_status: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = async () => {
    await Promise.all(unread.map((n) => markRead.mutateAsync(n.id)));
  };

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="relative h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
        <Bell className="h-5 w-5 text-white/70" />
        {unread.length > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-pink-500 border-2 border-[#0d0718] flex items-center justify-center">
            <span className="text-[7px] font-bold text-white leading-none">{unread.length > 9 ? "9+" : unread.length}</span>
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-14 right-4 z-50 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-bold text-gray-900 text-sm">Notifications</p>
              <div className="flex items-center gap-2">
                {unread.length > 0 && (
                  <button onClick={markAllRead} className="text-xs text-pink-600 font-semibold flex items-center gap-1">
                    <CheckCheck className="h-3 w-3" />Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-gray-100">
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 15).map((n) => (
                  <button key={n.id} onClick={() => { markRead.mutate(n.id); setOpen(false); if (n.action_link) window.location.href = n.action_link; }}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${!n.read_status ? "bg-pink-50/40" : ""}`}>
                    <div className="flex gap-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full h-fit flex-shrink-0 mt-0.5 ${typeColors[n.type] || typeColors.system}`}>
                        {n.type}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${!n.read_status ? "text-gray-900" : "text-gray-600"}`}>{n.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-gray-300 mt-1">{n.created_date ? format(new Date(n.created_date), "MMM d · h:mm a") : ""}</p>
                      </div>
                      {!n.read_status && <div className="h-2 w-2 rounded-full bg-pink-500 flex-shrink-0 mt-1.5" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}