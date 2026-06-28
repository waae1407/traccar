import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { ChevronsUpDown, Search, Car, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ReportSubjectSearch({ onSelect, selected }) {
  const [open, setOpen] = useState(false);

  const { data: bookings = [] } = useQuery({
    queryKey: ['report_bookings'],
    queryFn: () => base44.entities.BookingRequest.list('-created_date', 50),
    staleTime: 60_000,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['report_vehicles'],
    queryFn: () => base44.entities.Vehicle.list('-created_date', 50),
    staleTime: 60_000,
  });

  const label = selected
    ? `${selected.type === 'booking' ? 'Booking' : 'Vehicle'}: ${selected.label}`
    : 'Search booking or vehicle…';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-xs font-normal"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className={cn(!selected && 'text-muted-foreground', 'truncate')}>{label}</span>
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name, vehicle, VIN, email…" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No results found.</CommandEmpty>
            {bookings.length > 0 && (
              <CommandGroup heading="Bookings">
                {bookings.map(b => (
                  <CommandItem
                    key={b.id}
                    value={`${b.customer_full_name || ''} ${b.vehicle_name || ''} ${b.user_email || ''} ${b.id || ''}`}
                    onSelect={() => {
                      const label = `${b.customer_full_name || b.user_email || 'Unknown'} — ${b.vehicle_name || 'Vehicle'}`;
                      onSelect({ type: 'booking', id: b.id, label, booking: b });
                      setOpen(false);
                    }}
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{b.customer_full_name || b.user_email || 'Unknown customer'}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{b.vehicle_name || '—'} · {b.booking_status?.replace(/_/g, ' ')}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {vehicles.length > 0 && (
              <CommandGroup heading="Vehicles">
                {vehicles.map(v => (
                  <CommandItem
                    key={v.id}
                    value={`${v.make || ''} ${v.model || ''} ${v.vin || ''} ${v.plate || ''} ${v.year || ''}`}
                    onSelect={() => {
                      const label = `${v.year || ''} ${v.make || ''} ${v.model || ''}`;
                      onSelect({ type: 'vehicle', id: v.id, label, vehicle: v });
                      setOpen(false);
                    }}
                  >
                    <Car className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{v.year} {v.make} {v.model}</p>
                      <p className="text-[10px] text-muted-foreground truncate">VIN: {v.vin?.slice(-8) || '—'} · {v.status?.replace(/_/g, ' ')}</p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}