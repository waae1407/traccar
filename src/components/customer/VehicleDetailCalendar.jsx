import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronLeft, ChevronRight, AlertTriangle, Clock, CalendarDays } from "lucide-react";
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isBefore, startOfDay, isSameMonth } from "date-fns";

const STATUS_STYLES = {
  available: { bg: "bg-green-500/20", dot: "bg-green-500", label: "Available", text: "text-green-700" },
  booked: { bg: "bg-red-500/20", dot: "bg-red-500", label: "Booked", text: "text-red-700" },
  unavailable: { bg: "bg-gray-400/20", dot: "bg-gray-400", label: "Host Blocked", text: "text-gray-600" },
  maintenance: { bg: "bg-orange-500/20", dot: "bg-orange-500", label: "Maintenance", text: "text-orange-700" },
  personal_use: { bg: "bg-purple-500/20", dot: "bg-purple-500", label: "Personal Use", text: "text-purple-700" },
  return_required: { bg: "bg-amber-500/20", dot: "bg-amber-500", label: "Return Pending", text: "text-amber-700" },
  host_review: { bg: "bg-amber-500/20", dot: "bg-amber-500", label: "Host Review", text: "text-amber-700" },
  checkout_in_progress: { bg: "bg-yellow-400/20", dot: "bg-yellow-400", label: "Checkout in Progress", text: "text-yellow-700" },
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export default function VehicleDetailCalendar({ vehicle, onDatesSelected }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedStart, setSelectedStart] = useState(null);
  const [selectedEnd, setSelectedEnd] = useState(null);

  const startMonth = format(currentMonth, "yyyy-MM");
  const endMonth = format(addMonths(currentMonth, 1), "yyyy-MM");

  const { data, isLoading } = useQuery({
    queryKey: ["vehicle-detail-calendar", vehicle?.id, startMonth, endMonth],
    queryFn: () =>
      base44.functions
        .invoke("getVehicleAvailabilityCalendar", {
          vehicle_id: vehicle.id,
          start_month: startMonth,
          end_month: endMonth,
        })
        .then((r) => r.data),
    enabled: !!vehicle?.id,
  });

  const dayDataMap = useMemo(() => {
    const map = {};
    data?.calendar?.forEach((d) => {
      map[d.date] = d;
    });
    return map;
  }, [data]);

  const rules = data?.rules || {};

  // Generate calendar grid for current month
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const leadingBlanks = Array.from({ length: monthStart.getDay() }, (_, i) => null);

  const getDayData = (date) => dayDataMap[format(date, "yyyy-MM-dd")];

  const isDaySelectable = (date) => {
    const dayData = getDayData(date);
    if (!dayData) return false;
    if (dayData.can_book === false) return false;
    return dayData.status === "available";
  };

  const isDayInRange = (date) => {
    if (!selectedStart || !selectedEnd) return false;
    return date >= selectedStart && date <= selectedEnd;
  };

  const isSelected = (date) => {
    return (selectedStart && isSameDay(date, selectedStart)) ||
      (selectedEnd && isSameDay(date, selectedEnd));
  };

  const handleDayClick = (date) => {
    if (!isDaySelectable(date)) return;

    if (!selectedStart || (selectedStart && selectedEnd)) {
      // Start new selection
      setSelectedStart(date);
      setSelectedEnd(null);
      onDatesSelected?.(format(date, "yyyy-MM-dd"), null);
      return;
    }

    if (selectedStart && !selectedEnd) {
      if (isBefore(date, selectedStart)) {
        // Clicked before start — reset start
        setSelectedStart(date);
        onDatesSelected?.(format(date, "yyyy-MM-dd"), null);
        return;
      }

      // Validate all days in range are selectable
      const range = eachDayOfInterval({ start: selectedStart, end: date });
      const allSelectable = range.every((d) => isDaySelectable(d));
      if (!allSelectable) return; // Don't set end if range has gaps

      setSelectedEnd(date);
      onDatesSelected?.(format(selectedStart, "yyyy-MM-dd"), format(date, "yyyy-MM-dd"));
    }
  };

  const goPrevMonth = () => {
    const prev = addMonths(currentMonth, -1);
    if (!isBefore(prev, new Date()) || isSameMonth(prev, new Date())) {
      setCurrentMonth(prev);
    }
  };

  const goNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const minRental = rules.minimum_rental_days || 7;
  const advanceNotice = rules.advance_notice_hours || 0;
  const pickupWindow = rules.pickup_window_start && rules.pickup_window_end
    ? `${rules.pickup_window_start}–${rules.pickup_window_end}`
    : null;
  const returnWindow = rules.return_window_start && rules.return_window_end
    ? `${rules.return_window_start}–${rules.return_window_end}`
    : null;

  const selectedRangeDays = selectedStart && selectedEnd
    ? Math.ceil((selectedEnd - selectedStart) / (1000 * 60 * 60 * 24)) + 1
    : 0;
  const meetsMinRental = selectedRangeDays >= minRental;

  return (
    <div className="space-y-3">
      {/* Warnings */}
      {(minRental > 1 || advanceNotice > 0 || pickupWindow) && (
        <div className="flex flex-wrap gap-2">
          {minRental > 1 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100">
              <CalendarDays className="h-3 w-3" /> Min {minRental} days
            </span>
          )}
          {advanceNotice > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-100">
              <Clock className="h-3 w-3" /> {advanceNotice}h advance notice
            </span>
          )}
          {pickupWindow && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 text-xs font-semibold border border-gray-100">
              <Clock className="h-3 w-3" /> Pickup: {pickupWindow}
            </span>
          )}
          {returnWindow && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gray-50 text-gray-600 text-xs font-semibold border border-gray-100">
              <Clock className="h-3 w-3" /> Return: {returnWindow}
            </span>
          )}
        </div>
      )}

      {/* Selected range info */}
      {selectedStart && (
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="font-semibold">Selected:</span>
          <span className="px-2 py-0.5 rounded-md bg-pink-50 text-pink-700 font-medium">
            {format(selectedStart, "MMM d")}
          </span>
          {selectedEnd ? (
            <>
              <span className="text-gray-400">→</span>
              <span className="px-2 py-0.5 rounded-md bg-pink-50 text-pink-700 font-medium">
                {format(selectedEnd, "MMM d")}
              </span>
              <span className="text-gray-400">({selectedRangeDays} days)</span>
              {!meetsMinRental && (
                <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                  <AlertTriangle className="h-3 w-3" /> Needs {minRental} min
                </span>
              )}
            </>
          ) : (
            <span className="text-gray-400">— select return date</span>
          )}
        </div>
      )}

      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <button onClick={goPrevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft className="h-4 w-4 text-gray-500" />
        </button>
        <span className="font-bold text-sm text-gray-800">
          {format(currentMonth, "MMMM yyyy")}
        </span>
        <button onClick={goNextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-pink-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {leadingBlanks.map((_, i) => (
            <div key={`blank-${i}`} className="aspect-square" />
          ))}
          {daysInMonth.map((date) => {
            const dayData = getDayData(date);
            const selectable = isDaySelectable(date);
            const inRange = isDayInRange(date);
            const selected = isSelected(date);
            const style = STATUS_STYLES[dayData?.status] || STATUS_STYLES.available;

            return (
              <button
                key={date.toISOString()}
                onClick={() => handleDayClick(date)}
                disabled={!selectable && !selected}
                className={`
                  aspect-square rounded-lg text-xs font-medium flex flex-col items-center justify-center
                  transition-all relative
                  ${selectable ? "cursor-pointer hover:ring-2 hover:ring-pink-300" : "cursor-not-allowed"}
                  ${selected ? "bg-pink-500 text-white font-bold shadow-md" : inRange ? "bg-pink-100 text-pink-700" : style.bg}
                  ${!selectable && !selected ? style.text : ""}
                `}
                title={dayData ? `${format(date, "MMM d")}: ${dayData.customer_label || dayData.status}` : format(date, "MMM d")}
              >
                {format(date, "d")}
                {dayData && !selectable && !selected && (
                  <div className={`w-1.5 h-1.5 rounded-full ${style.dot} mt-0.5`} />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1.5 pt-2 border-t border-gray-100">
        {Object.entries(STATUS_STYLES).map(([key, s]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`h-2.5 w-2.5 rounded ${s.dot}`} />
            <span className="text-[10px] text-gray-500">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}