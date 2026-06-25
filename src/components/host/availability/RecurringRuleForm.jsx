import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Repeat } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const RECURRENCE_OPTIONS = [
  { value: "weekly", label: "Weekly (selected days)" },
  { value: "weekends", label: "Every Weekend (Sat & Sun)" },
  { value: "weekdays", label: "Every Weekday (Mon–Fri)" },
  { value: "monthly", label: "Monthly (specific day)" },
];

const WEEKDAY_OPTIONS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export default function RecurringRuleForm({ vehicleId, hostId }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const [pattern, setPattern] = useState("weekly");
  const [weeklyDays, setWeeklyDays] = useState([6, 0]); // Sat, Sun by default
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [blockType, setBlockType] = useState("blocked");
  const [reason, setReason] = useState("");
  const [customerReason, setCustomerReason] = useState("");

  const toggleDay = (day) => {
    setWeeklyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.VehicleRecurringAvailability.create(data),
    onSuccess: () => {
      toast({ title: "Success", description: "Recurring rule created" });
      qc.invalidateQueries({ queryKey: ["vehicle-availability-calendar"] });
      qc.invalidateQueries({ queryKey: ["vehicle-detail-calendar"] });
      setOpen(false);
      setReason("");
      setCustomerReason("");
      setEndDate("");
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!startDate) {
      toast({ title: "Missing date", description: "Start date is required", variant: "destructive" });
      return;
    }

    const base = {
      vehicle_id: vehicleId,
      host_id: hostId,
      availability_type: "blocked",
      recurrence_pattern: pattern === "weekends" || pattern === "weekdays" ? "weekly" : pattern,
      start_date: startDate,
      end_date: endDate || null,
      blocked_reason:
        blockType === "maintenance"
          ? "maintenance_scheduled"
          : blockType === "personal_use"
          ? "personal_use"
          : "host_blocked",
      notes: reason,
      is_active: true,
      created_by: hostId,
    };

    if (pattern === "weekly") {
      createMutation.mutate({ ...base, weekly_days: weeklyDays });
    } else if (pattern === "weekends") {
      createMutation.mutate({ ...base, weekly_days: [6, 0] });
    } else if (pattern === "weekdays") {
      createMutation.mutate({ ...base, weekly_days: [1, 2, 3, 4, 5] });
    } else if (pattern === "monthly") {
      createMutation.mutate({ ...base, monthly_day: monthlyDay });
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Repeat className="h-4 w-4 mr-2" />
        Add Recurring Rule
      </Button>
    );
  }

  return (
    <Card className="p-4 bg-card border-border">
      <div className="flex items-center gap-2 mb-3">
        <Repeat className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">New Recurring Rule</h3>
      </div>

      <div className="space-y-3">
        <div>
          <Label className="text-xs text-muted-foreground">Recurrence Pattern</Label>
          <Select value={pattern} onValueChange={setPattern}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {pattern === "weekly" && (
          <div>
            <Label className="text-xs text-muted-foreground">Days of Week</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {WEEKDAY_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                    weeklyDays.includes(d.value)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/70"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {pattern === "monthly" && (
          <div>
            <Label className="text-xs text-muted-foreground">Day of Month</Label>
            <Input
              type="number"
              min="1"
              max="31"
              className="mt-1"
              value={monthlyDay}
              onChange={(e) => setMonthlyDay(Number(e.target.value))}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Start Date</Label>
            <Input
              type="date"
              className="mt-1"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">End Date (optional)</Label>
            <Input
              type="date"
              className="mt-1"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Block Type</Label>
          <Select value={blockType} onValueChange={setBlockType}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="personal_use">Personal Use</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Reason (internal)</Label>
          <Textarea
            className="mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you blocking these dates?"
          />
        </div>

        <div>
          <Label className="text-xs text-muted-foreground">Customer-Facing Reason (optional)</Label>
          <Input
            className="mt-1"
            value={customerReason}
            onChange={(e) => setCustomerReason(e.target.value)}
            placeholder="e.g., Scheduled maintenance"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4 mr-1" />
            {createMutation.isPending ? "Creating…" : "Create Rule"}
          </Button>
        </div>
      </div>
    </Card>
  );
}