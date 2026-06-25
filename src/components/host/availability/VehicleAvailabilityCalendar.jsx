import React, { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, addMonths } from "date-fns";
import { Plus, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import AvailabilityQuickEdit from "./AvailabilityQuickEdit";
import RecurringRuleForm from "./RecurringRuleForm";

const STATUS_CONFIG = {
  available: { color: 'bg-green-500', label: 'Available' },
  booked: { color: 'bg-red-500', label: 'Booked' },
  blocked: { color: 'bg-gray-500', label: 'Blocked' },
  maintenance: { color: 'bg-orange-500', label: 'Maintenance' },
  personal_use: { color: 'bg-purple-500', label: 'Personal Use' },
  checkout_in_progress: { color: 'bg-yellow-500', label: 'Checkout in Progress' }
};

export default function VehicleAvailabilityCalendar({ vehicleId, hostId }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedDates, setSelectedDates] = useState([]);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockType, setBlockType] = useState('blocked');
  const [blockNotes, setBlockNotes] = useState('');
  const [customerReason, setCustomerReason] = useState('');

  // Dynamic months — current month + next month
  const now = new Date();
  const startMonth = format(now, 'yyyy-MM');
  const endMonth = format(addMonths(now, 1), 'yyyy-MM');

  const { data: calendarData, isLoading, refetch } = useQuery({
    queryKey: ['vehicle-availability-calendar', vehicleId, startMonth, endMonth],
    queryFn: () => base44.functions.invoke('getVehicleAvailabilityCalendar', {
      vehicle_id: vehicleId,
      start_month: startMonth,
      end_month: endMonth
    }).then(r => r.data),
    enabled: !!vehicleId
  });

  const { data: vehicleData } = useQuery({
    queryKey: ['vehicle-for-quickedit', vehicleId],
    queryFn: async () => {
      const results = await base44.entities.Vehicle.filter({ id: vehicleId });
      return results[0];
    },
    enabled: !!vehicleId,
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.VehicleAvailabilityRule.create(data),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Availability rule created' });
      setBlockDialogOpen(false);
      setSelectedDates([]);
      setBlockNotes('');
      setCustomerReason('');
      refetch();
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId) => base44.entities.VehicleAvailabilityRule.delete(ruleId),
    onSuccess: () => {
      toast({ title: 'Success', description: 'Rule deleted' });
      refetch();
    }
  });

  const handleDateSelect = (dates) => {
    setSelectedDates(dates || []);
  };

  const handleBlockDates = async () => {
    if (selectedDates.length === 0) return;

    // Create a rule for EVERY selected date (not just the first)
    const rules = selectedDates.map(date => ({
      vehicle_id: vehicleId,
      host_id: hostId,
      rule_type: blockType,
      start_date: format(date, 'yyyy-MM-dd'),
      reason: blockNotes,
      customer_reason: customerReason,
      is_active: true,
      created_by: hostId,
      created_at: new Date().toISOString()
    }));

    // Bulk create all rules
    try {
      await base44.entities.VehicleAvailabilityRule.bulkCreate(rules);
      toast({ title: 'Success', description: `${rules.length} date(s) blocked` });
      setBlockDialogOpen(false);
      setSelectedDates([]);
      setBlockNotes('');
      setCustomerReason('');
      refetch();
      qc.invalidateQueries({ queryKey: ['vehicle-detail-calendar'] });
    } catch (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const renderDay = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayData = calendarData?.calendar?.find(d => d.date === dateStr);
    const status = dayData?.status || 'available';
    const config = STATUS_CONFIG[status];

    return (
      <div className="relative h-full w-full p-1">
        <div className={`absolute inset-0 rounded ${config.color} opacity-20`} />
        {dayData && (
          <div className="absolute bottom-1 left-1 right-1 text-[10px] text-center truncate">
            {dayData.customer_label}
          </div>
        )}
        <span className="relative z-10">{format(date, 'd')}</span>
      </div>
    );
  };

  const rules = calendarData?.rules || {};

  return (
    <div className="space-y-4">
      <AvailabilityQuickEdit vehicle={vehicleData} hostId={hostId} />

      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg">Availability Calendar</h3>
        <RecurringRuleForm vehicleId={vehicleId} hostId={hostId} />
        <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={selectedDates.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Block Selected
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Block Selected Dates</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Selected Dates</Label>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedDates.length > 0 
                    ? `${selectedDates.length} date(s) selected`
                    : 'Select dates on the calendar'}
                </p>
              </div>
              <div>
                <Label>Block Type</Label>
                <Select value={blockType} onValueChange={setBlockType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="personal_use">Personal Use</SelectItem>
                    <SelectItem value="blackout">Blackout</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason (Internal)</Label>
                <Textarea
                  value={blockNotes}
                  onChange={(e) => setBlockNotes(e.target.value)}
                  placeholder="Why are you blocking these dates?"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Customer-Facing Reason (Optional)</Label>
                <Input
                  value={customerReason}
                  onChange={(e) => setCustomerReason(e.target.value)}
                  placeholder="e.g., Scheduled maintenance"
                  className="mt-1"
                />
              </div>
              <Button
                onClick={handleBlockDates}
                disabled={selectedDates.length === 0}
                className="w-full"
              >
                Block {selectedDates.length > 0 ? `${selectedDates.length} Date(s)` : 'Dates'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Customer Calendar Preview Note */}
      <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-xs text-blue-300">
        💡 This calendar mirrors what customers see on the vehicle detail page. Blocked dates will prevent booking.
      </div>

      {/* Availability Rules Summary */}
      <Card className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs text-gray-500">Minimum Rental</Label>
            <p className="text-lg font-bold">{rules.minimum_rental_days || 7} days</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Advance Notice</Label>
            <p className="text-lg font-bold">{rules.advance_notice_hours || 0} hours</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Instant Booking</Label>
            <p className="text-lg font-bold">{rules.instant_booking_enabled ? 'Enabled' : 'Disabled'}</p>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Contactless</Label>
            <p className="text-lg font-bold">{rules.contactless_pickup ? 'Yes' : 'No'}</p>
          </div>
        </div>
      </Card>

      {/* Calendar */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin" />
        </div>
      ) : (
        <Card className="p-6">
          <Calendar
            mode="multiple"
            selected={selectedDates}
            onSelect={handleDateSelect}
            className="rounded-md border"
            components={{
              DayContent: renderDay
            }}
          />
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, config]) => (
          <div key={status} className="flex items-center gap-2">
            <div className={`h-4 w-4 rounded ${config.color}`} />
            <span className="text-sm text-gray-600">{config.label}</span>
          </div>
        ))}
      </div>

      {/* Availability Rules List */}
      <Card className="p-4">
        <h3 className="font-bold mb-4">Upcoming Blocked Dates</h3>
        <div className="space-y-2">
          {calendarData?.calendar?.filter(d => d.status !== 'available' && d.status !== 'booked').slice(0, 10).map((day, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{format(new Date(day.date), 'MMM d, yyyy')}</Badge>
                <span className="text-sm">{day.customer_label || day.status}</span>
              </div>
              {day.rule_id && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteRuleMutation.mutate(day.rule_id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}