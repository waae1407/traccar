import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

const DEFAULT_SECTIONS = [
  { key: 'compliance_header', label: 'Compliance Certification Header', description: 'Title + mandatory telematics requirement statement', defaultOn: true },
  { key: 'vehicle_identification', label: 'Policy & Vehicle Identification', description: 'Vehicle details, VIN, booking reference, host info', defaultOn: true },
  { key: 'data_stream_verification', label: 'Telematics Data Stream Verification', description: 'Verification of each mandatory data category', defaultOn: true },
  { key: 'data_continuity', label: 'Data Continuity Assessment', description: 'Gap analysis and real-time data availability', defaultOn: true },
  { key: 'compliance_status', label: 'Compliance Status Determination', description: 'Overall COMPLIANT / PARTIAL / NON-COMPLIANT ruling', defaultOn: true },
  { key: 'misrepresentation_risk', label: 'Material Misrepresentation Risk', description: 'Risk level and coverage impact assessment', defaultOn: true },
  { key: 'damage_findings', label: 'Damage & Incident Findings', description: 'Photos, telematics events, safety alerts analysis', defaultOn: true },
  { key: 'attestation', label: 'Attestation & Signature Section', description: 'Compliance attestation with date/signature block', defaultOn: true },
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