import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import ReportSubjectSearch from '@/components/insurance/ReportSubjectSearch';

const REPORT_TYPES = [
  { value: 'insurance_audit', label: 'Insurance Audit Report' },
  { value: 'damage_assessment', label: 'Damage Assessment Report' },
  { value: 'claim_summary', label: 'Insurance Claim Summary' },
  { value: 'dispute_resolution', label: 'Dispute Resolution Report' },
  { value: 'fleet_risk_analysis', label: 'Fleet Risk Analysis Report' },
];

export default function ReportBuilder({ onGenerated }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [subject, setSubject] = useState(null);
  const [reportType, setReportType] = useState('insurance_audit');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!subject) {
      toast({ variant: 'destructive', title: 'Selection required', description: 'Search and select a booking or vehicle first.' });
      return;
    }
    setGenerating(true);
    try {
      const res = await base44.functions.invoke('generateInsuranceReport', {
        booking_request_id: subject.type === 'booking' ? subject.id : undefined,
        vehicle_id: subject.type === 'vehicle' ? subject.id : undefined,
        report_type: reportType,
      });
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
          <p className="text-muted-foreground text-xs">Generate audit & insurance reports from evidence data</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Search Booking or Vehicle</Label>
        <ReportSubjectSearch onSelect={setSubject} selected={subject} />
        <p className="text-muted-foreground text-[11px]">
          Pick a booking to include rental evidence, or a vehicle for fleet-level analysis.
        </p>
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