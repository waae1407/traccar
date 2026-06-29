import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, FileText, Car, User } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ReportSubjectSearch from '@/components/insurance/ReportSubjectSearch';
import ReportCustomizationPanel from '@/components/insurance/ReportCustomizationPanel';
import ReportDateRangeSelector from '@/components/insurance/ReportDateRangeSelector';

const REPORT_TYPES = [
  { value: 'telematics_data_report', label: 'Telematics Data Report' },
  { value: 'damage_assessment', label: 'Damage Assessment' },
  { value: 'claim_summary', label: 'Claim Summary' },
  { value: 'dispute_resolution', label: 'Dispute Resolution' },
  { value: 'fleet_risk_analysis', label: 'Fleet Risk Analysis' },
];

const FILTER_MODES = [
  { value: 'vehicle', label: 'By Vehicle', icon: Car },
  { value: 'customer', label: 'By Customer', icon: User },
];

export default function ReportBuilder({ onGenerated }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterMode, setFilterMode] = useState('vehicle');
  const [subject, setSubject] = useState(null);
  const [reportType, setReportType] = useState('telematics_data_report');
  const [dateRange, setDateRange] = useState({ date_from: null, date_to: null });
  const [generating, setGenerating] = useState(false);
  const [customization, setCustomization] = useState({
    sections: ['report_header', 'vehicle_identification', 'telematics_device_info', 'data_stream_summary', 'data_continuity', 'incident_findings', 'evidence_photos_section'],
    data_streams: ['time_stamped_location', 'speed', 'fuel_consumption', 'engine_diagnostics', 'vehicle_status', 'mileage_data', 'driver_behavior'],
    include_evidence_photos: true,
    include_telematics_events: true,
    include_safety_events: true,
    include_odometer_history: true,
  });

  const handleModeChange = (mode) => {
    setFilterMode(mode);
    setSubject(null);
  };

  const handleGenerate = async () => {
    if (!subject) {
      toast({ variant: 'destructive', title: 'Selection required', description: `Search and select a ${filterMode === 'vehicle' ? 'vehicle' : 'customer'} first.` });
      return;
    }
    if (!customization.sections.length || !customization.data_streams.length) {
      toast({ variant: 'destructive', title: 'Customization required', description: 'Select at least one section and one data stream.' });
      return;
    }
    if (!dateRange.date_from || !dateRange.date_to) {
      toast({ variant: 'destructive', title: 'Date range required', description: 'Please select or define a date range.' });
      return;
    }
    setGenerating(true);
    try {
      const payload = {
        report_type: reportType,
        sections: customization.sections,
        data_streams: customization.data_streams,
        include_evidence_photos: customization.include_evidence_photos,
        include_telematics_events: customization.include_telematics_events,
        include_safety_events: customization.include_safety_events,
        include_odometer_history: customization.include_odometer_history,
        date_from: dateRange.date_from,
        date_to: dateRange.date_to,
      };

      if (subject.type === 'vehicle') {
        payload.vehicle_id = subject.id;
      } else if (subject.type === 'customer') {
        payload.customer_id = subject.id;
      } else if (subject.type === 'customer_booking') {
        payload.booking_request_id = subject.id;
      }

      const res = await base44.functions.invoke('generateInsuranceReport', payload);
      const evidence = res.data?.evidence;
      if (evidence) {
        toast({ title: 'Report generated', description: 'AI report saved to EvidenceVault.' });
        await qc.invalidateQueries({ queryKey: ['evidence_vault'] });
        onGenerated?.(evidence);
        setSubject(null);
      } else {
        toast({ variant: 'destructive', title: 'Generation failed', description: res.data?.error || 'Unknown error' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Generation failed', description: err.response?.data?.error || err.message || 'Unknown error' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-9 w-9 rounded-lg gradient-primary">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">AI Report Builder</h3>
          <p className="text-muted-foreground text-xs">Generate telematics data reports from evidence data</p>
        </div>
      </div>

      {/* Filter Mode Toggle */}
      <div className="space-y-1.5">
        <Label className="text-xs">Report Filter</Label>
        <div className="flex gap-2">
          {FILTER_MODES.map(m => {
            const Icon = m.icon;
            return (
              <button
                key={m.value}
                onClick={() => handleModeChange(m.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                  filterMode === m.value
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject Search */}
      <div className="space-y-1.5">
        <Label className="text-xs">
          {filterMode === 'vehicle' ? 'Select Vehicle' : 'Select Customer'}
        </Label>
        <ReportSubjectSearch onSelect={setSubject} selected={subject} mode={filterMode} />
        <p className="text-muted-foreground text-[11px]">
          {filterMode === 'vehicle'
            ? 'Pick a vehicle for fleet-level telematics data.'
            : 'Pick a customer to report on their rental activity and telematics data.'}
        </p>
      </div>

      {/* Date Range */}
      <div className="space-y-1.5">
        <Label className="text-xs">Date Range</Label>
        <ReportDateRangeSelector onChange={setDateRange} />
      </div>

      {/* Report Type */}
      <div className="space-y-1.5">
        <Label className="text-xs">Report Type</Label>
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.value}
              onClick={() => setReportType(rt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                reportType === rt.value
                  ? 'border-primary bg-primary/15 text-primary'
                  : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>
      </div>

      <ReportCustomizationPanel onChange={setCustomization} />

      <Button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full"
      >
        {generating ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Generating Report…</>
        ) : (
          <><FileText className="h-4 w-4" /> Generate AI Report</>
        )}
      </Button>

      <p className="text-muted-foreground text-[11px] leading-relaxed">
        The AI gathers telematics data within the selected date range — position history, events, safety alerts,
        and inspection photos — then generates a readable report stored in the EvidenceVault.
      </p>
    </div>
  );
}