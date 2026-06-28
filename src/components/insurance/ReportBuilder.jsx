import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';

const REPORT_TYPES = [
  { value: 'insurance_audit', label: 'Insurance Audit Report' },
  { value: 'damage_assessment', label: 'Damage Assessment Report' },
  { value: 'claim_summary', label: 'Insurance Claim Summary' },
  { value: 'dispute_resolution', label: 'Dispute Resolution Report' },
  { value: 'fleet_risk_analysis', label: 'Fleet Risk Analysis Report' },
];

export default function ReportBuilder({ onGenerated }) {
  const qc = useQueryClient();
  const [bookingId, setBookingId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [reportType, setReportType] = useState('insurance_audit');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!bookingId && !vehicleId) {
      toast.error('Enter a Booking ID or Vehicle ID');
      return;
    }
    setGenerating(true);
    try {
      const res = await base44.functions.invoke('generateInsuranceReport', {
        booking_request_id: bookingId || undefined,
        vehicle_id: vehicleId || undefined,
        report_type: reportType,
      });
      const evidence = res.data?.evidence;
      if (evidence) {
        toast.success('Report generated successfully');
        await qc.invalidateQueries({ queryKey: ['evidence_vault'] });
        onGenerated?.(evidence);
        setBookingId('');
        setVehicleId('');
      } else {
        toast.error(res.data?.error || 'Failed to generate report');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to generate report');
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
          <p className="text-muted-foreground text-xs">Generate audit & insurance reports from evidence data</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Booking Request ID</Label>
          <Input
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            placeholder="Optional — links to specific rental"
            className="text-xs font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Vehicle ID</Label>
          <Input
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            placeholder="Optional — if no booking ID"
            className="text-xs font-mono"
          />
        </div>
      </div>

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
        The AI gathers evidence from booking photos, telematics events, inspection packets, and safety alerts,
        then generates an immutable audit report stored in the EvidenceVault.
      </p>
    </div>
  );
}