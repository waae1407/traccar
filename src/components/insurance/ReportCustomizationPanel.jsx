import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

const DEFAULT_SECTIONS = [
  { key: 'report_header', label: 'Report Header', description: 'Title, generation date, and brief report description', defaultOn: true },
  { key: 'vehicle_identification', label: 'Vehicle & Booking Identification', description: 'Vehicle details, VIN, booking reference, host info', defaultOn: true },
  { key: 'telematics_device_info', label: 'Telematics Device Information', description: 'Device provider, IMEI, status, installation details, alarms', defaultOn: true },
  { key: 'data_stream_summary', label: 'Telematics Data Stream Summary', description: 'What data was found for each stream (counts, date ranges)', defaultOn: true },
  { key: 'data_continuity', label: 'Data Continuity Summary', description: 'Gap analysis and data coverage timeline', defaultOn: true },
  { key: 'incident_findings', label: 'Incident & Event Findings', description: 'Safety events, telematics alerts, notable occurrences', defaultOn: true },
  { key: 'evidence_photos_section', label: 'Evidence Photos', description: 'Pickup/return inspection photos with URLs', defaultOn: true },
];

const DEFAULT_DATA_STREAMS = [
  { key: 'time_stamped_location', label: 'Time-Stamped Vehicle Location', defaultOn: true },
  { key: 'speed', label: 'Speed Data', defaultOn: true },
  { key: 'fuel_consumption', label: 'Fuel Consumption', defaultOn: true },
  { key: 'engine_diagnostics', label: 'Engine Diagnostics', defaultOn: true },
  { key: 'vehicle_status', label: 'Vehicle Status', defaultOn: true },
  { key: 'mileage_data', label: 'Mileage Data', defaultOn: true },
  { key: 'driver_behavior', label: 'Driver Behavior', defaultOn: true },
];

export default function ReportCustomizationPanel({ onChange }) {
  const [expanded, setExpanded] = useState(false);
  const [sections, setSections] = useState(DEFAULT_SECTIONS.map(s => ({ ...s, on: s.defaultOn })));
  const [dataStreams, setDataStreams] = useState(DEFAULT_DATA_STREAMS.map(s => ({ ...s, on: s.defaultOn })));
  const [includeEvidencePhotos, setIncludeEvidencePhotos] = useState(true);
  const [includeTelematicsEvents, setIncludeTelematicsEvents] = useState(true);
  const [includeSafetyEvents, setIncludeSafetyEvents] = useState(true);
  const [includeOdometerHistory, setIncludeOdometerHistory] = useState(true);

  const allSectionsOff = sections.every(s => !s.on);
  const allStreamsOff = dataStreams.every(s => !s.on);

  // Notify parent of changes
  useEffect(() => {
    onChange?.({
      sections: sections.filter(s => s.on).map(s => s.key),
      data_streams: dataStreams.filter(s => s.on).map(s => s.key),
      include_evidence_photos: includeEvidencePhotos,
      include_telematics_events: includeTelematicsEvents,
      include_safety_events: includeSafetyEvents,
      include_odometer_history: includeOdometerHistory,
    });
  }, [sections, dataStreams, includeEvidencePhotos, includeTelematicsEvents, includeSafetyEvents, includeOdometerHistory]);

  const toggleSection = (key) => {
    setSections(prev => prev.map(s => s.key === key ? { ...s, on: !s.on } : s));
  };

  const toggleStream = (key) => {
    setDataStreams(prev => prev.map(s => s.key === key ? { ...s, on: !s.on } : s));
  };

  const setAllSections = (on) => setSections(prev => prev.map(s => ({ ...s, on })));
  const setAllStreams = (on) => setDataStreams(prev => prev.map(s => ({ ...s, on })));

  return (
    <div className="rounded-lg border border-border bg-secondary/20 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-secondary/40 transition-colors"
      >
        <span className="text-xs font-semibold flex items-center gap-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Customize Report Sections & Data Streams
        </span>
        <span className="text-[10px] text-muted-foreground">
          {sections.filter(s => s.on).length} sections · {dataStreams.filter(s => s.on).length} streams
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Report Sections */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Report Sections</span>
              <div className="flex gap-2">
                <button onClick={() => setAllSections(true)} className="text-[10px] text-primary hover:underline">All</button>
                <button onClick={() => setAllSections(false)} className="text-[10px] text-muted-foreground hover:underline">None</button>
              </div>
            </div>
            {sections.map(s => (
              <label key={s.key} className="flex items-start gap-2.5 py-1 cursor-pointer group">
                <Checkbox
                  checked={s.on}
                  onCheckedChange={() => toggleSection(s.key)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium group-hover:text-primary transition-colors">{s.label}</span>
                  <p className="text-[10px] text-muted-foreground leading-tight">{s.description}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Data Streams */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Telematics Data Streams</span>
              <div className="flex gap-2">
                <button onClick={() => setAllStreams(true)} className="text-[10px] text-primary hover:underline">All</button>
                <button onClick={() => setAllStreams(false)} className="text-[10px] text-muted-foreground hover:underline">None</button>
              </div>
            </div>
            {dataStreams.map(s => (
              <label key={s.key} className="flex items-center gap-2.5 py-1 cursor-pointer group">
                <Checkbox
                  checked={s.on}
                  onCheckedChange={() => toggleStream(s.key)}
                  className="mt-0.5"
                />
                <span className="text-xs font-medium group-hover:text-primary transition-colors">{s.label}</span>
              </label>
            ))}
          </div>

          {/* Evidence Sources */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Evidence Sources</span>
            <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
              <Checkbox checked={includeEvidencePhotos} onCheckedChange={setIncludeEvidencePhotos} className="mt-0.5" />
              <span className="text-xs font-medium group-hover:text-primary transition-colors">Inspection Photos (pickup/return)</span>
            </label>
            <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
              <Checkbox checked={includeTelematicsEvents} onCheckedChange={setIncludeTelematicsEvents} className="mt-0.5" />
              <span className="text-xs font-medium group-hover:text-primary transition-colors">Telematics Events (diagnostics, pings)</span>
            </label>
            <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
              <Checkbox checked={includeSafetyEvents} onCheckedChange={setIncludeSafetyEvents} className="mt-0.5" />
              <span className="text-xs font-medium group-hover:text-primary transition-colors">Safety Events (Alert360)</span>
            </label>
            <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
              <Checkbox checked={includeOdometerHistory} onCheckedChange={setIncludeOdometerHistory} className="mt-0.5" />
              <span className="text-xs font-medium group-hover:text-primary transition-colors">Odometer History</span>
            </label>
          </div>

          {(allSectionsOff || allStreamsOff) && (
            <p className="text-[10px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
              ⚠️ At least one section and one data stream must be selected to generate a meaningful report.
            </p>
          )}
        </div>
      )}
    </div>
  );
}