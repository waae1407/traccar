import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ShieldAlert, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import ReactMarkdown from 'react-markdown';

const STATUS_STYLES = {
  collected: 'bg-blue-500/20 text-blue-400',
  verified: 'bg-green-500/20 text-green-400',
  disputed: 'bg-red-500/20 text-red-400',
  archived: 'bg-muted text-muted-foreground',
  transmitted: 'bg-purple-500/20 text-purple-400',
};

export default function EvidenceDetailDrawer({ evidence, open, onOpenChange }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState(null);
  const [transmitEmail, setTransmitEmail] = useState('');
  const [showTransmitForm, setShowTransmitForm] = useState(false);

  if (!evidence) return null;

  const updateStatus = async (newStatus, extra = {}) => {
    setActionLoading(newStatus);
    try {
      await base44.entities.EvidenceVault.update(evidence.id, {
        status: newStatus,
        ...extra,
      });
      await qc.invalidateQueries({ queryKey: ['evidence_vault'] });
      toast({ title: `Evidence ${newStatus}` });
      onOpenChange?.(false);
    } catch (err) {
      toast({ variant: 'destructive', title: 'Update failed', description: 'Failed to update evidence status' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleTransmit = async () => {
    const email = transmitEmail.trim();
    if (!email) {
      toast({ variant: 'destructive', title: 'Email required', description: 'Enter a recipient email address.' });
      return;
    }
    setActionLoading('transmitted');
    try {
      const res = await base44.functions.invoke('transmitInsuranceReport', {
        evidence_id: evidence.id,
        recipient_email: email,
      });
      if (res.data?.success) {
        toast({ title: 'Report transmitted', description: `Email sent to ${email}` });
        await qc.invalidateQueries({ queryKey: ['evidence_vault'] });
        setShowTransmitForm(false);
        setTransmitEmail('');
        onOpenChange?.(false);
      } else {
        toast({ variant: 'destructive', title: 'Transmission failed', description: res.data?.error || 'Unknown error' });
      }
    } catch (err) {
      toast({ variant: 'destructive', title: 'Transmission failed', description: err.response?.data?.error || err.message || 'Unknown error' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2 pr-8">
            <SheetTitle className="text-lg">{evidence.title}</SheetTitle>
            <Badge className={`${STATUS_STYLES[evidence.status] || 'bg-muted text-muted-foreground'} text-xs`}>
              {evidence.status}
            </Badge>
          </div>
          <SheetDescription className="text-xs">
            {evidence.description}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-muted-foreground text-[11px]">Evidence Type</p>
              <p className="text-sm font-medium mt-0.5">{evidence.evidence_type?.replace(/_/g, ' ')}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-muted-foreground text-[11px]">Evidence Date</p>
              <p className="text-sm font-medium mt-0.5">
                {evidence.evidence_date ? format(new Date(evidence.evidence_date), 'MMM d, yyyy HH:mm') : '—'}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-muted-foreground text-[11px]">Vehicle</p>
              <p className="text-sm font-medium mt-0.5">{evidence.vehicle_name || '—'}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-muted-foreground text-[11px]">Created By</p>
              <p className="text-sm font-medium mt-0.5">{evidence.created_by || '—'}</p>
            </div>
          </div>

          {/* AI Report */}
          {evidence.ai_report_summary && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-primary">AI Report Summary</p>
                {evidence.ai_confidence_score != null && (
                  <Badge className="bg-primary/15 text-primary text-xs">
                    {(evidence.ai_confidence_score * 100).toFixed(0)}% confidence
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{evidence.ai_report_summary}</p>
            </div>
          )}

          {/* Findings */}
          {evidence.ai_findings?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Key Findings</p>
              {evidence.ai_findings.map((f, i) => (
                <div key={i} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm flex gap-2">
                  <span className="text-primary text-xs mt-0.5">▸</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {evidence.ai_recommendations?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Recommendations</p>
              {evidence.ai_recommendations.map((r, i) => (
                <div key={i} className="rounded-lg bg-secondary/30 px-3 py-2 text-sm flex gap-2">
                  <span className="text-green-400 text-xs mt-0.5">✓</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}

          {/* Full Report */}
          {evidence.ai_report_content && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Full Report</p>
              <div className="rounded-lg bg-secondary/20 border border-border p-4 max-h-96 overflow-y-auto">
                <ReactMarkdown className="text-sm prose prose-sm prose-invert max-w-none">
                  {evidence.ai_report_content}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {/* Evidence Photos */}
          {evidence.evidence_urls?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Evidence Photos ({evidence.evidence_urls.length})</p>
              <div className="grid grid-cols-3 gap-2">
                {evidence.evidence_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors">
                    <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-20 object-cover" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Transmission info */}
          {evidence.status === 'transmitted' && (
            <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 space-y-1">
              <p className="text-xs font-semibold text-purple-400">Transmission Record</p>
              <p className="text-sm">To: {evidence.transmitted_to || '—'}</p>
              <p className="text-xs text-muted-foreground">
                Method: {evidence.transmission_method} ·
                {evidence.transmitted_at ? ` ${format(new Date(evidence.transmitted_at), 'MMM d, yyyy HH:mm')}` : ''}
              </p>
              {evidence.transmission_notes && <p className="text-xs text-muted-foreground">{evidence.transmission_notes}</p>}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            {evidence.status === 'collected' && (
              <Button size="sm" onClick={() => updateStatus('verified', { verified_by: 'admin', verified_at: new Date().toISOString() })}
                disabled={actionLoading === 'verified'}>
                {actionLoading === 'verified' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                Verify
              </Button>
            )}
            {evidence.status !== 'disputed' && evidence.status !== 'transmitted' && (
              <Button size="sm" variant="destructive" onClick={() => updateStatus('disputed', { dispute_reason: 'Flagged for review' })}
                disabled={actionLoading === 'disputed'}>
                <ShieldAlert className="h-3.5 w-3.5" /> Flag Dispute
              </Button>
            )}
            {evidence.status !== 'transmitted' && !showTransmitForm && (
              <Button size="sm" variant="outline" onClick={() => setShowTransmitForm(true)}
                disabled={actionLoading === 'transmitted'}>
                <Send className="h-3.5 w-3.5" /> Transmit via Email
              </Button>
            )}
            {evidence.status !== 'transmitted' && showTransmitForm && (
              <div className="w-full space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
                <p className="text-xs font-semibold">Send report to:</p>
                <input
                  type="email"
                  value={transmitEmail}
                  onChange={(e) => setTransmitEmail(e.target.value)}
                  placeholder="recipient@email.com"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  onKeyDown={(e) => e.key === 'Enter' && handleTransmit()}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleTransmit} disabled={actionLoading === 'transmitted'}>
                    {actionLoading === 'transmitted' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send Now
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setShowTransmitForm(false); setTransmitEmail(''); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {evidence.status === 'transmitted' && (
              <Button size="sm" variant="outline" onClick={() => updateStatus('archived')}
                disabled={actionLoading === 'archived'}>
                Archive
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}