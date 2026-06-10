import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Gavel, TrendingDown, Globe, Trophy, ArrowRightLeft, Sparkles } from 'lucide-react';
import PurchaseRequestForm from '@/components/dealer360/PurchaseRequestForm';
import PurchaseRequestDrawer from '@/components/dealer360/PurchaseRequestDrawer';
import SellRequestForm from '@/components/dealer360/SellRequestForm';
import SellRequestDrawer from '@/components/dealer360/SellRequestDrawer';
import PublicListingsTab from '@/components/dealer360/PublicListingsTab';
import AIValuationTool from '@/components/dealer360/AIValuationTool';
import Dealer360StatusBadge from '@/components/dealer360/StatusBadge';

const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';

function KpiCard({ label, value, sub, color = 'text-foreground' }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function PurchaseRow({ pr, onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl border border-border/40 bg-card/40 hover:border-primary/30 transition-colors p-4 flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{pr.year} {pr.make} {pr.model}</span>
          <Dealer360StatusBadge status={pr.status} />
        </div>
        <span className="text-xs text-muted-foreground font-mono">{pr.vin} · {pr.auction_source?.toUpperCase()} · Max: {fmt(pr.max_bid)}</span>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-cyan-400">{fmt(pr.hold_amount)} hold</p>
        <p className="text-xs text-muted-foreground">{pr.submitted_at ? new Date(pr.submitted_at).toLocaleDateString() : 'Draft'}</p>
      </div>
    </button>
  );
}

function SellRow({ sr, onClick }) {
  const ROUTE_ICONS = { auction: Gavel, uride_direct: TrendingDown, public_listing: Globe };
  const RouteIcon = ROUTE_ICONS[sr.sell_route] || ArrowRightLeft;
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl border border-border/40 bg-card/40 hover:border-primary/30 transition-colors p-4 flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <RouteIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm truncate">{sr.year} {sr.make} {sr.model}</span>
          <Dealer360StatusBadge status={sr.status} type="sell" />
        </div>
        <span className="text-xs text-muted-foreground font-mono">{sr.vin} · {sr.condition} · {sr.mileage?.toLocaleString()} mi</span>
      </div>
      <div className="text-right shrink-0">
        {sr.uride_offer_amount && <p className="text-sm font-semibold text-primary">{fmt(sr.uride_offer_amount)} offer</p>}
        {sr.net_proceeds && <p className="text-sm font-semibold text-green-400">{fmt(sr.net_proceeds)} net</p>}
        {sr.ai_wholesale_value && !sr.net_proceeds && <p className="text-xs text-cyan-400">AI: {fmt(sr.ai_wholesale_value)}</p>}
      </div>
    </button>
  );
}

function WonVehicleCard({ vehicle }) {
  return (
    <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">{vehicle.year} {vehicle.make} {vehicle.model}</p>
        <Badge className="text-xs capitalize bg-green-500/20 text-green-400">{vehicle.status?.replace(/_/g, ' ')}</Badge>
      </div>
      <p className="text-xs font-mono text-muted-foreground">{vehicle.vin}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-muted-foreground">Total Cost </span><span className="font-bold">{fmt(vehicle.total_cost)}</span></div>
        <div><span className="text-muted-foreground">Source </span><span>{vehicle.auction_source}</span></div>
        <div><span className="text-muted-foreground">Purchased </span><span>{vehicle.purchase_date}</span></div>
        <div><span className="text-muted-foreground">Mileage </span><span>{vehicle.mileage?.toLocaleString() || '?'} mi</span></div>
      </div>
    </div>
  );
}

export default function HostDealer360() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('buy');
  const [showBuyForm, setShowBuyForm] = useState(false);
  const [showSellForm, setShowSellForm] = useState(false);
  const [showValuation, setShowValuation] = useState(false);
  const [selectedPR, setSelectedPR] = useState(null);
  const [selectedSR, setSelectedSR] = useState(null);

  // Host record
  const { data: hosts = [] } = useQuery({
    queryKey: ['my_host', user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  const { data: purchaseRequests = [], isLoading: prLoading } = useQuery({
    queryKey: ['dealer_purchase_requests', host?.id],
    queryFn: () => base44.entities.DealerPurchaseRequest.filter({ host_id: host.id }, '-created_date', 50),
    enabled: !!host?.id,
  });

  const { data: sellRequests = [], isLoading: srLoading } = useQuery({
    queryKey: ['dealer_sell_requests', host?.id],
    queryFn: () => base44.entities.DealerSellRequest.filter({ host_id: host.id }, '-created_date', 50),
    enabled: !!host?.id,
  });

  const { data: wonVehicles = [] } = useQuery({
    queryKey: ['dealer_won_vehicles', host?.id],
    queryFn: () => base44.entities.DealerWonVehicle.filter({ host_id: host.id }, '-created_date', 50),
    enabled: !!host?.id,
  });

  const refresh = () => {
    qc.invalidateQueries(['dealer_purchase_requests', host?.id]);
    qc.invalidateQueries(['dealer_sell_requests', host?.id]);
    qc.invalidateQueries(['dealer_won_vehicles', host?.id]);
    setShowBuyForm(false);
    setShowSellForm(false);
    setSelectedPR(null);
    setSelectedSR(null);
  };

  // KPIs
  const activeBids = purchaseRequests.filter(p => ['funded', 'under_review', 'bid_placed', 'outbid'].includes(p.status)).length;
  const wonCount = wonVehicles.length;
  const totalSold = sellRequests.filter(s => s.status === 'sold').reduce((s, r) => s + (r.net_proceeds || 0), 0);
  const openOffers = sellRequests.filter(s => s.uride_offer_status === 'pending').length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowRightLeft className="h-6 w-6 text-primary" />Dealer360</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Vehicle acquisition & liquidation — powered by uRide</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowValuation(true)}>
            <Sparkles className="h-4 w-4 mr-1.5" />AI Valuation
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowSellForm(true); setTab('sell'); }}>
            <TrendingDown className="h-4 w-4 mr-1.5" />Sell a Vehicle
          </Button>
          <Button size="sm" className="gradient-primary" onClick={() => { setShowBuyForm(true); setTab('buy'); }}>
            <Plus className="h-4 w-4 mr-1.5" />New Purchase Request
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Active Bids" value={activeBids} sub="In progress" color="text-cyan-400" />
        <KpiCard label="Won Vehicles" value={wonCount} sub="In fleet" color="text-green-400" />
        <KpiCard label="Net Proceeds" value={fmt(totalSold)} sub="From sold vehicles" color="text-primary" />
        <KpiCard label="Open Offers" value={openOffers} sub="Awaiting response" color="text-yellow-400" />
      </div>

      {/* Main Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary/30">
          <TabsTrigger value="buy" className="flex items-center gap-1.5"><Gavel className="h-3.5 w-3.5" />Buy</TabsTrigger>
          <TabsTrigger value="won" className="flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" />Won Vehicles</TabsTrigger>
          <TabsTrigger value="sell" className="flex items-center gap-1.5"><TrendingDown className="h-3.5 w-3.5" />Sell</TabsTrigger>
          <TabsTrigger value="listings" className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Public Listings</TabsTrigger>
        </TabsList>

        <TabsContent value="buy" className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{purchaseRequests.length} request(s)</p>
            <Button size="sm" className="gradient-primary" onClick={() => setShowBuyForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />New Request
            </Button>
          </div>
          {prLoading && <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}
          {!prLoading && purchaseRequests.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Gavel className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No purchase requests yet.</p>
              <p className="text-xs mt-1">Browse an auction portal, copy a VIN, and create your first request.</p>
            </div>
          )}
          <div className="space-y-2">
            {purchaseRequests.map(pr => <PurchaseRow key={pr.id} pr={pr} onClick={() => setSelectedPR(pr)} />)}
          </div>
        </TabsContent>

        <TabsContent value="won" className="space-y-3 mt-4">
          {wonVehicles.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <Trophy className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No won vehicles yet.</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wonVehicles.map(v => <WonVehicleCard key={v.id} vehicle={v} />)}
          </div>
        </TabsContent>

        <TabsContent value="sell" className="space-y-3 mt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{sellRequests.length} sell request(s)</p>
            <Button size="sm" className="gradient-primary" onClick={() => setShowSellForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" />Sell a Vehicle
            </Button>
          </div>
          {srLoading && <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}
          {!srLoading && sellRequests.length === 0 && (
            <div className="text-center py-10 text-muted-foreground">
              <TrendingDown className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No sell requests yet.</p>
            </div>
          )}
          <div className="space-y-2">
            {sellRequests.map(sr => <SellRow key={sr.id} sr={sr} onClick={() => setSelectedSR(sr)} />)}
          </div>
        </TabsContent>

        <TabsContent value="listings" className="mt-4">
          <PublicListingsTab hostId={host?.id} isAdmin={false} />
        </TabsContent>
      </Tabs>

      {/* Buy Form Dialog */}
      <Dialog open={showBuyForm} onOpenChange={setShowBuyForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader><DialogTitle>New Purchase Request</DialogTitle></DialogHeader>
          <PurchaseRequestForm
            hostId={host?.id} hostEmail={host?.email || user?.email} hostName={host?.full_name || user?.full_name}
            onSuccess={refresh} />
        </DialogContent>
      </Dialog>

      {/* Sell Form Dialog */}
      <Dialog open={showSellForm} onOpenChange={setShowSellForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader><DialogTitle>Sell a Vehicle</DialogTitle></DialogHeader>
          <SellRequestForm
            hostId={host?.id} hostEmail={host?.email || user?.email} hostName={host?.full_name || user?.full_name}
            onSuccess={refresh} />
        </DialogContent>
      </Dialog>

      {/* AI Valuation Dialog */}
      <Dialog open={showValuation} onOpenChange={setShowValuation}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader><DialogTitle>AI Wholesale Valuation</DialogTitle></DialogHeader>
          <AIValuationTool />
        </DialogContent>
      </Dialog>

      {/* Purchase Request Drawer */}
      <PurchaseRequestDrawer pr={selectedPR} open={!!selectedPR} onClose={() => setSelectedPR(null)} isAdmin={false} onRefresh={refresh} />

      {/* Sell Request Drawer */}
      <SellRequestDrawer sr={selectedSR} open={!!selectedSR} onClose={() => setSelectedSR(null)} isAdmin={false} onRefresh={refresh} />
    </div>
  );
}