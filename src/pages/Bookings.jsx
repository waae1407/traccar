import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import BookingFormDialog from "@/components/bookings/BookingFormDialog";
import { format } from "date-fns";

export default function Bookings() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const queryClient = useQueryClient();

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => base44.entities.Booking.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Booking.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bookings"] }); setDialogOpen(false); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Booking.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bookings"] }); setDialogOpen(false); setEditingBooking(null); },
  });

  const handleSave = (data) => {
    if (editingBooking) updateMutation.mutate({ id: editingBooking.id, data });
    else createMutation.mutate(data);
  };

  const typeColors = { Daily: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20", Weekly: "text-purple-400 bg-purple-500/10 border-purple-500/20", Monthly: "text-blue-400 bg-blue-500/10 border-blue-500/20", "Rent-to-Own": "text-pink-400 bg-pink-500/10 border-pink-500/20" };

  const columns = [
    { key: "customer_name", label: "Customer", render: (r) => (
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(265 80% 62%) 0%, hsl(338 90% 56%) 100%)" }}>
          {(r.customer_name || "?").charAt(0)}
        </div>
        <span className="font-medium text-white">{r.customer_name || "—"}</span>
      </div>
    )},
    { key: "vehicle_name", label: "Vehicle", render: (r) => <span className="text-white/60">{r.vehicle_name || "—"}</span> },
    { key: "booking_type", label: "Type", render: (r) => (
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${typeColors[r.booking_type] || "text-white/50 bg-white/5 border-white/10"}`}>
        {r.booking_type}
      </span>
    )},
    { key: "start_date", label: "Start", render: (r) => r.start_date
      ? <span className="text-white/60">{format(new Date(r.start_date), "MMM d, yyyy")}</span>
      : <span className="text-white/20">—</span> },
    { key: "end_date", label: "End", render: (r) => r.end_date
      ? <span className="text-white/60">{format(new Date(r.end_date), "MMM d, yyyy")}</span>
      : <span className="text-white/20">—</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (!isLoading && bookings.length === 0) {
    return (
      <>
        <EmptyState icon={CalendarDays} title="No bookings yet" description="Create your first booking to start tracking rentals." actionLabel="New Booking" onAction={() => setDialogOpen(true)} />
        <BookingFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader count={bookings.length} countLabel="bookings" onAdd={() => { setEditingBooking(null); setDialogOpen(true); }} addLabel="New Booking" />
      <DataTable columns={columns} data={bookings} isLoading={isLoading}
        onRowClick={(row) => { setEditingBooking(row); setDialogOpen(true); }} />
      <BookingFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingBooking(null); }}
        onSave={handleSave} booking={editingBooking}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}