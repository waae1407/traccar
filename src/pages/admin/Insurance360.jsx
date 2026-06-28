import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck, FileText, AlertTriangle, Send, Database, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import ReportBuilder from '@/components/insurance/ReportBuilder';
import EvidenceDetailDrawer from '@/components/insurance/EvidenceDetailDrawer';

const STATUS_STYLES = {
  collected: 'bg-blue-500/20 text-blue-400',
  verified: 'bg-green-500/20 text-green-400',
  disputed: 'bg-red-500/20 text-red-400',
  archived: 'bg-muted text-muted-foreground',
  transmitted: 'bg-purple-500/20 text-purple-400',
};

function MetricCard({ label, value, sub, color, icon: Icon }) {
  return (
    <div className="rounded-xl bg-secondary/40 border border-border p-4 flex items-center gap-3">
      {Icon && (
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      )}
      <div>
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className={`text-xl font-bold mt-0.5 ${color || ''}`}>{value}</p>
        {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function EvidenceRow({ evidence, onClick }) {
  return (
    <button
      onClick={() => onClick(evidence)}
      className="w-full flex items-center justify-between gap-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 border border-border/50 hover:border-primary/30 px-3 py-2.5 text-sm transition-all text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{evidence.title}</p>
        <p className="text-muted-foreground text-xs mt-0.5">
          {evidence.vehicle_name || '—'} · {evidence.evidence_type?.replace(/_/g, ' ')}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {evidence.ai_confidence_score != null && (
          <span className="text-xs text-muted-foreground">
            {(evidence.ai_confidence_score * 100).toFixed(0)}%
          </span>
        )}
        <Badge className={`${STATUS_STYLES[evidence.status] || 'bg-muted text-muted-foreground'} text-xs`}>
          {evidence.status}
        </Badge>
      </div>
    </button>
  );
}

export default function Insurance360() {
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: allEvidence = [], isLoading } = useQuery({
    queryKey: ['evidence_vault', 'all'],
    queryFn: () => base44.entities.EvidenceVault.list('-created_date', 100),
    refetchOnWindowFocus: false,
  });

  const { data: aiReports = [] } = useQuery({
    queryKey: ['evidence_vault', 'ai_reports'],
    queryFn: () => base44.entities.EvidenceVault.filter({ evidence_type: 'ai_generated_report' }, '-created_date', 50),
    refetchOnWindowFocus: false,
  });

  const pendingVerification = allEvidence.filter(e => e.status === 'collected');
  const disputed = allEvidence.filter(e => e.status === 'disputed');
  const transmitted = allEvidence.filter(e => e.status === 'transmitted');
  const verified = allEvidence.filter(e => e.status === 'verified');

  const openDetail = (evidence) => {
    setSelectedEvidence(evidence);
    setDrawerOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Insurance360
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          EvidenceVault · Audit document generation · Insurance carrier transmission · AI-assisted reporting
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Total Evidence" value={allEvidence.length} icon={Database} />
        <MetricCard label="AI Reports" value={aiReports.length} color="text-primary" icon={FileText} />
        <MetricCard label="Verified" value={verified.length} color="text-green-400" icon={ShieldCheck} />
        <MetricCard label="Pending" value={pendingVerification.length} color="text-yellow-400" icon={Loader2} />
        <MetricCard label="Disputed" value={disputed.length} color="text-red-400" icon={AlertTriangle} />
        <MetricCard label="Transmitted" value={transmitted.length} color="text-purple-400" icon={Send} />
      </div>

      {/* Report Builder */}
      <ReportBuilder onGenerated={(evidence) => openDetail(evidence)} />

      {/* Tabs */}
      <Tabs defaultValue="all">
        <TabsList className="flex-wrap h-auto gap-1">
          {[
            ['all', `All Evidence (${allEvidence.length})`],
            ['ai_reports', `AI Reports (${aiReports.length})`],
            ['pending', `Pending Verification (${pendingVerification.length})`],
            ['disputed', `Disputed (${disputed.length})`],
            ['transmitted', `Transmitted (${transmitted.length})`],
          ].map(([v, l]) => (
            <TabsTrigger key={v} value={v}>{l}</TabsTrigger>
          ))}
        </TabsList>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading evidence…
          </div>
        )}

        {!isLoading && (
          <>
            <TabsContent value="all" className="mt-4 space-y-2">
              {allEvidence.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  No evidence records yet. Generate an AI report above to get started.
                </p>
              ) : (
                allEvidence.map(e => <EvidenceRow key={e.id} evidence={e} onClick={openDetail} />)
              )}
            </TabsContent>

            <TabsContent value="ai_reports" className="mt-4 space-y-2">
              {aiReports.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No AI-generated reports yet.</p>
              ) : (
                aiReports.map(e => <EvidenceRow key={e.id} evidence={e} onClick={openDetail} />)
              )}
            </TabsContent>

            <TabsContent value="pending" className="mt-4 space-y-2">
              {pendingVerification.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No evidence pending verification.</p>
              ) : (
                pendingVerification.map(e => <EvidenceRow key={e.id} evidence={e} onClick={openDetail} />)
              )}
            </TabsContent>

            <TabsContent value="disputed" className="mt-4 space-y-2">
              {disputed.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No disputed evidence.</p>
              ) : (
                disputed.map(e => <EvidenceRow key={e.id} evidence={e} onClick={openDetail} />)
              )}
            </TabsContent>

            <TabsContent value="transmitted" className="mt-4 space-y-2">
              {transmitted.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">No transmitted evidence.</p>
              ) : (
                transmitted.map(e => <EvidenceRow key={e.id} evidence={e} onClick={openDetail} />)
              )}
            </TabsContent>
          </>
        )}
      </Tabs>

      <EvidenceDetailDrawer
        evidence={selectedEvidence}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </div>
  );
}