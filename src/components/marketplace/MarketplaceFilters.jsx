import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Filter, X, MapPin, Calendar, DollarSign, Fuel, Car } from "lucide-react";
import { format } from "date-fns";

const VEHICLE_TYPES = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'coupe', label: 'Coupe' },
  { value: 'convertible', label: 'Convertible' },
  { value: 'van', label: 'Van' },
  { value: 'wagon', label: 'Wagon' },
  { value: 'hatchback', label: 'Hatchback' }
];

const TRANSMISSION_TYPES = [
  { value: 'automatic', label: 'Automatic' },
  { value: 'manual', label: 'Manual' },
];

const FUEL_TYPES = [
  { value: 'gasoline', label: 'Gasoline' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'plug_in_hybrid', label: 'Plug-in Hybrid' }
];

export default function MarketplaceFilters({ 
  filters, 
  onFiltersChange, 
  vehicleCount,
  isLoading 
}) {
  const [localFilters, setLocalFilters] = useState(filters || {
    city: '',
    pickup_date: '',
    return_date: '',
    price_min: 0,
    price_max: 500,
    vehicle_type: [],
    fuel_type: [],
    make: '',
    model: '',
    year_min: '',
    year_max: '',
    seats: '',
    transmission: '',
    host_rating_min: '',
    contactless_pickup: false,
    delivery_available: false,
    instant_booking: true,
    rental_type: 'weekly',
    sort: 'recommended'
  });

  const [isSheetOpen, setIsSheetOpen] = useState(false);

  // Sync localFilters when parent filters change (e.g., from URL params)
  useEffect(() => {
    if (filters) setLocalFilters(filters);
  }, [filters]);

  const handleApplyFilters = () => {
    onFiltersChange(localFilters);
    setIsSheetOpen(false);
  };

  const handleClearFilters = () => {
    const cleared = {
      city: '',
      pickup_date: '',
      return_date: '',
      price_min: 0,
      price_max: 500,
      vehicle_type: [],
      fuel_type: [],
      make: '',
      model: '',
      year_min: '',
      year_max: '',
      seats: '',
      transmission: '',
      host_rating_min: '',
      contactless_pickup: false,
      delivery_available: false,
      instant_booking: true,
      rental_type: 'weekly',
      sort: 'recommended'
    };
    setLocalFilters(cleared);
    onFiltersChange(cleared);
  };

  const activeFilterCount = Object.values(localFilters).filter(v => {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'boolean') return v === true;
    return v !== '' && v !== null && v !== undefined && v !== 0;
  }).length;

  return (
    <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4">
          {/* Search Bar */}
          {/* Location */}
          <div className="flex flex-col gap-1 lg:w-64">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-pink-500 pointer-events-none" />
              <Input
                placeholder="City or ZIP code"
                value={localFilters.city}
                onChange={(e) => setLocalFilters({ ...localFilters, city: e.target.value })}
                className="pl-10 border-gray-300 focus:border-pink-500 focus:ring-pink-500/20 h-11"
              />
            </div>
          </div>
          {/* Dates */}
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Rental Period
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  type="date"
                  value={localFilters.pickup_date}
                  onChange={(e) => setLocalFilters({ ...localFilters, pickup_date: e.target.value })}
                  className="pl-10 h-11 border-gray-300 focus:border-pink-500 focus:ring-pink-500/20"
                />
              </div>
              <div className="flex items-center justify-center h-11 px-1">
                <span className="text-gray-300 text-lg">→</span>
              </div>
              <div className="relative flex-1">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  type="date"
                  value={localFilters.return_date}
                  onChange={(e) => setLocalFilters({ ...localFilters, return_date: e.target.value })}
                  className="pl-10 h-11 border-gray-300 focus:border-pink-500 focus:ring-pink-500/20"
                />
              </div>
            </div>
          </div>

          {/* Sort */}
          <div className="flex flex-col gap-1 lg:w-52">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Sort By
            </label>
            <Select
              value={localFilters.sort}
              onValueChange={(v) => setLocalFilters({ ...localFilters, sort: v })}
            >
              <SelectTrigger className="h-11 border-gray-300 focus:border-pink-500">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="lowest_price">Price: Low to High</SelectItem>
                <SelectItem value="highest_price">Price: High to Low</SelectItem>
                <SelectItem value="newest">Newest Vehicles</SelectItem>
                <SelectItem value="closest">Closest Distance</SelectItem>
                <SelectItem value="available_soonest">Available Soonest</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Results + Filter Button */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {isLoading ? 'Searching...' : `${vehicleCount} vehicles`}
            </label>
            <div className="flex items-center gap-2 h-11">
              <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="relative h-11 px-4 border-gray-300 hover:border-pink-400 hover:bg-pink-50">
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge className="absolute -top-2 -right-2 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs bg-pink-600 text-white border-2 border-white">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
              <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="py-4 space-y-6">
                  <FilterContent 
                    localFilters={localFilters} 
                    setLocalFilters={setLocalFilters} 
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleClearFilters} variant="outline" className="flex-1">
                      <X className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                    <Button onClick={handleApplyFilters} className="flex-1">
                      Apply Filters
                    </Button>
                  </div>
                </div>
              </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>

        {/* Active Filters Tags */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {localFilters.city && (
              <Badge variant="secondary" className="gap-1">
                {localFilters.city}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => setLocalFilters({ ...localFilters, city: '' })}
                />
              </Badge>
            )}
            {localFilters.pickup_date && (
              <Badge variant="secondary" className="gap-1">
                {format(new Date(localFilters.pickup_date), 'MMM d')}
                <X 
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setLocalFilters({ ...localFilters, pickup_date: '' })}
                />
              </Badge>
            )}
            {localFilters.return_date && (
              <Badge variant="secondary" className="gap-1">
                {format(new Date(localFilters.return_date), 'MMM d')}
                <X 
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setLocalFilters({ ...localFilters, return_date: '' })}
                />
              </Badge>
            )}
            {localFilters.contactless_pickup && (
              <Badge variant="secondary" className="gap-1">
                Contactless Pickup
                <X 
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setLocalFilters({ ...localFilters, contactless_pickup: false })}
                />
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterContent({ localFilters, setLocalFilters }) {
  return (
    <div className="space-y-6">
      {/* Date Range (also in top bar, but included here for mobile) */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Dates
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Pickup Date</Label>
            <Input
              type="date"
              value={localFilters.pickup_date}
              onChange={(e) => setLocalFilters({ ...localFilters, pickup_date: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Return Date</Label>
            <Input
              type="date"
              value={localFilters.return_date}
              onChange={(e) => setLocalFilters({ ...localFilters, return_date: e.target.value })}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Price Range */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Price Range (Weekly)
        </h4>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Label className="text-xs">Min</Label>
            <Input
              type="number"
              value={localFilters.price_min}
              onChange={(e) => setLocalFilters({ ...localFilters, price_min: Number(e.target.value) })}
              className="mt-1"
            />
          </div>
          <span className="text-gray-400">-</span>
          <div className="flex-1">
            <Label className="text-xs">Max</Label>
            <Input
              type="number"
              value={localFilters.price_max}
              onChange={(e) => setLocalFilters({ ...localFilters, price_max: Number(e.target.value) })}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Vehicle Type */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Vehicle Type</h4>
        <div className="flex flex-wrap gap-2">
          {VEHICLE_TYPES.map(type => (
            <Badge
              key={type.value}
              variant={localFilters.vehicle_type?.includes(type.value) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => {
                const types = localFilters.vehicle_type || [];
                const newTypes = types.includes(type.value)
                  ? types.filter(t => t !== type.value)
                  : [...types, type.value];
                setLocalFilters({ ...localFilters, vehicle_type: newTypes });
              }}
            >
              {type.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Make / Model / Year / Seats / Transmission */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Vehicle Details</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Make</Label>
            <Input
              placeholder="e.g. Toyota"
              value={localFilters.make || ''}
              onChange={(e) => setLocalFilters({ ...localFilters, make: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Model</Label>
            <Input
              placeholder="e.g. Camry"
              value={localFilters.model || ''}
              onChange={(e) => setLocalFilters({ ...localFilters, model: e.target.value })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Year Min</Label>
            <Input
              type="number"
              placeholder="2020"
              value={localFilters.year_min || ''}
              onChange={(e) => setLocalFilters({ ...localFilters, year_min: e.target.value ? Number(e.target.value) : '' })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Year Max</Label>
            <Input
              type="number"
              placeholder="2025"
              value={localFilters.year_max || ''}
              onChange={(e) => setLocalFilters({ ...localFilters, year_max: e.target.value ? Number(e.target.value) : '' })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Min Seats</Label>
            <Input
              type="number"
              placeholder="4"
              value={localFilters.seats || ''}
              onChange={(e) => setLocalFilters({ ...localFilters, seats: e.target.value ? Number(e.target.value) : '' })}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Transmission</Label>
            <Select
              value={localFilters.transmission || ''}
              onValueChange={(v) => setLocalFilters({ ...localFilters, transmission: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                {TRANSMISSION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Min Host Rating</Label>
            <Select
              value={localFilters.host_rating_min || ''}
              onValueChange={(v) => setLocalFilters({ ...localFilters, host_rating_min: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3+ Stars</SelectItem>
                <SelectItem value="4">4+ Stars</SelectItem>
                <SelectItem value="4.5">4.5+ Stars</SelectItem>
                <SelectItem value="4.8">4.8+ Stars</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Fuel Type */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Fuel className="h-4 w-4" />
          Fuel Type
        </h4>
        <div className="space-y-2">
          {FUEL_TYPES.map(fuel => (
            <div key={fuel.value} className="flex items-center gap-2">
              <Checkbox
                checked={localFilters.fuel_type?.includes(fuel.value)}
                onCheckedChange={(checked) => {
                  const types = localFilters.fuel_type || [];
                  const newTypes = checked
                    ? [...types, fuel.value]
                    : types.filter(t => t !== fuel.value);
                  setLocalFilters({ ...localFilters, fuel_type: newTypes });
                }}
              />
              <Label className="text-sm">{fuel.label}</Label>
            </div>
          ))}
        </div>
      </div>

      {/* Features */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Features</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={localFilters.contactless_pickup}
              onCheckedChange={(checked) => setLocalFilters({ ...localFilters, contactless_pickup: checked })}
            />
            <Label className="text-sm">Contactless Pickup</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={localFilters.delivery_available}
              onCheckedChange={(checked) => setLocalFilters({ ...localFilters, delivery_available: checked })}
            />
            <Label className="text-sm">Delivery Available</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={localFilters.instant_booking}
              onCheckedChange={(checked) => setLocalFilters({ ...localFilters, instant_booking: checked })}
            />
            <Label className="text-sm">Instant Booking</Label>
          </div>
        </div>
      </div>

      {/* Rental Type */}
      <div className="space-y-3">
        <h4 className="font-semibold text-sm">Rental Type</h4>
        <Select
          value={localFilters.rental_type}
          onValueChange={(v) => setLocalFilters({ ...localFilters, rental_type: v })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}