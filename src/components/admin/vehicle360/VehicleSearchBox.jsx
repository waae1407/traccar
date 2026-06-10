import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, AlertTriangle, Clock, Car } from 'lucide-react';

const STATUS_COLORS = {
  Available: 'bg-green-500/20 text-green-400',
  'Active Rental': 'bg-blue-500/20 text-blue-400',
  Booked: 'bg-blue-500/20 text-blue-400',
  'Payment Due': 'bg-yellow-500/20 text-yellow-400',
  'Grace Period': 'bg-yellow-500/20 text-yellow-400',
  Suspended: 'bg-red-500/20 text-red-400',
  Maintenance: 'bg-orange-500/20 text-orange-400',
  'Compliance Hold': 'bg-red-500/20 text-red-400',
  'Out of Service': 'bg-muted text-muted-foreground',
};

function VehicleResultRow({ vehicle, onSelect }) {
  return (
    <button
      onClick={() => onSelect(vehicle)}
      className="w-full text-left px-4 py-3 hover:bg-primary/10 transition-colors flex items-center justify-between gap-3 border-b border-border/40 last:border-0"
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground truncate">{vehicle.label}</span>
          {vehicle.alert_count > 0 && (
            <Badge className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0">{vehicle.alert_count} alert{vehicle.alert_count > 1 ? 's' : ''}</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>VIN: {vehicle.vin}</span>
          {vehicle.plate !== '—' && <span>Plate: {vehicle.plate}</span>}
          <span>{vehicle.host_name}</span>
        </div>
      </div>
      <Badge className={`text-xs shrink-0 ${STATUS_COLORS[vehicle.status] || 'bg-muted text-muted-foreground'}`}>
        {vehicle.status}
      </Badge>
    </button>
  );
}

export default function VehicleSearchBox({ onSelect, selectedVehicleId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recentVehicles, setRecentVehicles] = useState([]);
  const [alertVehicles, setAlertVehicles] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeSection, setActiveSection] = useState('search'); // 'search' | 'recent' | 'alerts'
  const debounceRef = useRef(null);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Load recent + alert vehicles on mount
  useEffect(() => {
    const loadSections = async () => {
      try {
        const [recentRes, alertRes] = await Promise.all([
          base44.functions.invoke('searchVehicles360', { mode: 'recent' }),
          base44.functions.invoke('searchVehicles360', { mode: 'alerts' }),
        ]);
        setRecentVehicles(recentRes.data?.results || []);
        setAlertVehicles(alertRes.data?.results || []);
      } catch (_) {}
    };
    loadSections();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setResults([]);
      setActiveSection('recent');
      return;
    }
    setActiveSection('search');
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await base44.functions.invoke('searchVehicles360', { query });
        setResults(res.data?.results || []);
      } catch (_) {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (vehicle) => {
    setShowDropdown(false);
    setQuery('');
    onSelect(vehicle.id);
  };

  const displayResults = activeSection === 'alerts' ? alertVehicles
    : activeSection === 'recent' ? recentVehicles
    : results;

  const sectionLabel = activeSection === 'alerts' ? 'Vehicles With Alerts'
    : activeSection === 'recent' ? 'Recent Active Vehicles'
    : `Search Results${results.length ? ` (${results.length})` : ''}`;

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl">
      {/* Search Input */}
      <div className="relative">
        {isSearching
          ? <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          : <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        }
        <Input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          placeholder="Search by VIN, plate, make/model, customer name, booking ID, host…"
          className="pl-9 pr-4 h-11 text-sm bg-secondary/40 border-border focus:border-primary/50"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); setResults([]); setActiveSection('recent'); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
          >✕</button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
          {/* Section Tabs */}
          <div className="flex border-b border-border bg-secondary/30">
            <button
              onClick={() => { setActiveSection('recent'); setQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${activeSection === 'recent' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Clock className="h-3 w-3" /> Recent
            </button>
            <button
              onClick={() => { setActiveSection('alerts'); setQuery(''); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${activeSection === 'alerts' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <AlertTriangle className="h-3 w-3" />
              Alerts {alertVehicles.length > 0 && <span className="bg-red-500/20 text-red-400 rounded-full px-1.5 text-xs">{alertVehicles.length}</span>}
            </button>
            {query.length >= 2 && (
              <button
                onClick={() => setActiveSection('search')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${activeSection === 'search' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Car className="h-3 w-3" /> Results {results.length > 0 && `(${results.length})`}
              </button>
            )}
          </div>

          {/* Results List */}
          <div className="max-h-80 overflow-y-auto">
            {isSearching && activeSection === 'search' ? (
              <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </div>
            ) : displayResults.length > 0 ? (
              <>
                <div className="px-4 py-1.5 text-xs text-muted-foreground bg-secondary/20 font-medium">{sectionLabel}</div>
                {displayResults.map(v => (
                  <VehicleResultRow key={v.id} vehicle={v} onSelect={handleSelect} />
                ))}
              </>
            ) : (
              <div className="px-4 py-6 text-center text-muted-foreground text-sm">
                {activeSection === 'search' && query.length >= 2
                  ? 'No vehicles found matching your search.'
                  : activeSection === 'alerts'
                  ? 'No vehicles with open alerts.'
                  : 'No recent active vehicles found.'}
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-border/40 bg-secondary/20 text-xs text-muted-foreground">
            Search by VIN · plate · make/model · year · customer · booking ID · host name
          </div>
        </div>
      )}
    </div>
  );
}