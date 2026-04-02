import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import DataTable from "@/components/shared/DataTable";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      setDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Booking.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      setDialogOpen(false);
      setEditingBooking(null);
    },
  });

  const handleSave = (data) => {
    if (editingBooking) {
      updateMutation.mutate({ id: editingBooking.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const columns = [
    { key: "customer_name", label: "Customer", render: (r) => <span className="font-medium">{r.customer_name || "—"}</span> },
    { key: "vehicle_name", label: "Vehicle", render: (r) => r.vehicle_name || "—" },
    { key: "booking_type", label: "Type", render: (r) => r.booking_type },
    { key: "start_date", label: "Start", render: (r) => r.start_date ? format(new Date(r.start_date), "MMM d, yyyy") : "—" },
    { key: "end_date", label: "End", render: (r) => r.end_date ? format(new Date(r.end_date), "MMM d, yyyy") : "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  if (!isLoading && bookings.length === 0) {
    return (
      <>
        <EmptyState icon={CalendarDays} title="No bookings yet" description="Create your first booking." actionLabel="New Booking" onAction={() => setDialogOpen(true)} />
        <BookingFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={handleSave} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{bookings.length} bookings</p>
        <Button onClick={() => { setEditingBooking(null); setDialogOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> New Booking
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={bookings}
        isLoading={isLoading}
        onRowClick={(row) => { setEditingBooking(row); setDialogOpen(true); }}
      />
      <BookingFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditingBooking(null); }}
        onSave={handleSave}
        booking={editingBooking}
        isSaving={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}