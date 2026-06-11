import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Gavel, TrendingDown, Globe, Trophy, ArrowRightLeft, Search, AlertTriangle, Monitor } from 'lucide-react';
import PurchaseRequestDrawer from '@/components/dealer360/PurchaseRequestDrawer';
import SellRequestDrawer from '@/components/dealer360/SellRequestDrawer';
import PublicListingsTab from '@/components/dealer360/PublicListingsTab';
import Dealer360StatusBadge from '@/components/dealer360/StatusBadge';
import ACVAdminSettings from '@/components/dealer360/ACVAdminSettings';

const fmt = (n) => n != null ? `$${Number(n).toLocaleString()}` : '—';

function KpiCard({ label, value, color = 'text-foreground' }) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/60 p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function AdminPurchaseRow({ pr, onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl border border-border/40 bg-card/40 hover:border-primary/30 transition-colors p-4 flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{pr.year} {pr.make} {pr.model}</span>
          <Dealer360StatusBadge status={pr.status} />
          {pr.hold_status === 'authorized' && <Badge className="text-xs bg-cyan-500/20 text-cyan-400">Hold Active</Badge>}
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="font-mono">{pr.vin}</span>
          <span>{pr.host_email}</span>
          <span>{pr.auction_source?.toUpperCase()}</span>
        </div>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        <p className="text-sm font-semibold">Max: {fmt(pr.max_bid)}</p>
        <p className="text-xs text-cyan-400">Hold: {fmt(pr.hold_amount)}</p>
        {pr.total_due && <p className="text-xs text-primary">Invoice: {fmt(pr.total_due)}</p>}
      </div>
    </button>
  );
}

function AdminSellRow({ sr, onClick }) {
  const ROUTE_LABELS = { auction: 'Auction', uride_direct: 'Direct', public_listing: 'Public' };
  return (
    <button onClick={onClick} className="w-full text-left rounded-xl border border-border/40 bg-card/40 hover:border-primary/30 transition-colors p-4 flex items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{sr.year} {sr.make} {sr.model}</span>
          <Dealer360StatusBadge status={sr.status} type="sell" />
          <Badge className="text-xs bg-secondary text-muted-foreground">{ROUTE_LABELS[sr.sell_route]}</Badge>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="font-mono">{sr.vin}</span>
          <span>{sr.host_email}</span>
          <span className="capitalize">{sr.condition}</span>
        </div>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        {sr.ai_wholesale_value && <p className="text-xs text-cyan-400">AI: {fmt(sr.ai_wholesale_value)}</p>}
        {sr.uride_offer_amount && <p className="text-sm font-semibold text-primary">Offer: {fmt(sr.uride_offer_amount)}</p>}
        {sr.net_proceeds && <p className="text-sm font-semibold text-green-400">Net: {fmt(sr.net_proceeds)}</p>}
      </div>
    </button>
  );
}

const PURCHASE_STATUS_GROUPS = {
  'Action Required': ['funded', 'payment_due'],
  'In Progress': ['under_review', 'bid_placed', 'outbid', 'invoice_pending'],
  'Won': ['won', 'completed'],
  'Closed': ['lost', 'cancelled'],
};

export default function AdminDealer360() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('purchase');
  const [showACVSettings, setShowACVSettings] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedPR, setSelectedPR] = useState(null);
  const [selectedSR, setSelectedSR] = useState(null);
  const [prFilter, setPrFilter] = useState('all');
  const [srFilter, setSrFilter] = useState('all');

  const { data: purchaseRequests = [], isLoading: prLoading } = useQuery({
    queryKey: ['admin_dealer_purchase_all'],
    queryFn: () => base44.entities.DealerPurchaseRequest.list('-created_date', 200),
  });

  const { data: sellRequests = [], isLoading: srLoading } = useQuery({
    queryKey: ['admin_dealer_sell_all'],
    queryFn: () => base44.entities.DealerSellRequest.list('-created_date', 200),
  });

  const { data: wonVehicles = [] } = useQuery({
    queryKey: ['admin_dealer_won_all'],
    queryFn: () => base44.entities.DealerWonVehicle.list('-created_date', 200),
  });

  const refresh = () => {
    qc.invalidateQueries(['admin_dealer_purchase_all']);
    qc.invalidateQueries(['admin_dealer_sell_all']);
    qc.invalidateQueries(['admin_dealer_won_all']);
    setSelectedPR(null);
    setSelectedSR(null);
  };

  const searchFilter = (items) => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      (i.vin || '').toLowerCase().includes(q) ||
      (i.host_email || '').toLowerCase().includes(q) ||
      (i.make || '').toLowerCase().includes(q) ||
      (i.model || '').toLowerCase().includes(q)
    );
  };

  const filteredPRs = searchFilter(prFilter === 'all' ? purchaseRequests : purchaseRequests.filter(p => p.status === prFilter));
  const filteredSRs = searchFilter(srFilter === 'all' ? sellRequests : sellRequests.filter(s => s.status === srFilter));

  // KPIs
  const actionRequired = purchaseRequests.filter(p => ['funded', 'payment_due'].includes(p.status)).length;
  const inBidProcess = purchaseRequests.filter(p => ['under_review', 'bid_placed'].includes(p.status)).length;
  const totalHeld = purchaseRequests.filter(p => p.hold_status === 'authorized').reduce((s, p) => s + (p.hold_amount || 0), 0);
  const pendingSellReviews = sellRequests.filter(s => s.status === 'submitted').length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowRightLeft className="h-6 w-6 text-primary" />Dealer360 — Admin Bid Desk</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage all host acquisition and liquidation requests</p>
        </div>
        <button onClick={() => setShowACVSettings(s => !s)} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${showACVSettings ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' : 'border-border text-muted-foreground hover:text-foreground'}`}>
          <Monitor className="h-3.5 w-3.5" />ACV Viewer Settings
        </button>
      </div>
      {showACVSettings && (
        <div className="rounded-2xl border border-border/50 bg-card/60 p-5">
          <ACVAdminSettings />
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Action Required" value={actionRequired} color="text-red-400" />
        <KpiCard label="Active Bids" value={inBidProcess} color="text-cyan-400" />
        <KpiCard label="Total Holds Active" value={fmt(totalHeld)} color="text-yellow-400" />
        <KpiCard label="Sell Reviews Pending" value={pendingSellReviews} color="text-primary" />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search VIN, host email, make/model…" className="pl-9 bg-secondary/40" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-secondary/30">
          <TabsTrigger value="purchase" className="flex items-center gap-1.5">
            <Gavel className="h-3.5 w-3.5" />Purchase Requests
            {actionRequired > 0 && <Badge className="ml-1 bg-red-500/20 text-red-400 text-xs px-1.5">{actionRequired}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="won" className="flex items-center gap-1.5"><Trophy className="h-3.5 w-3.5" />Won Vehicles</TabsTrigger>
          <TabsTrigger value="sell" className="flex items-center gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" />Sell Requests
            {pendingSellReviews > 0 && <Badge className="ml-1 bg-yellow-500/20 text-yellow-400 text-xs px-1.5">{pendingSellReviews}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="listings" className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5" />Public Listings</TabsTrigger>
        </TabsList>

        <TabsContent value="purchase" className="space-y-4 mt-4">
          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            {['all', 'funded', 'under_review', 'bid_placed', 'won', 'payment_due', 'completed', 'lost', 'cancelled'].map(s => (
              <button key={s} onClick={() => setPrFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize ${prFilter === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/80'}`}>
                {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
                {s !== 'all' && <span className="ml-1.5 opacity-60">{purchaseRequests.filter(p => p.status === s).length}</span>}
              </button>
            ))}
          </div>

          {prLoading && <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}
          <div className="space-y-2">
            {filteredPRs.map(pr => <AdminPurchaseRow key={pr.id} pr={pr} onClick={() => setSelectedPR(pr)} />)}
            {!prLoading && filteredPRs.length === 0 && <p className="text-muted-foreground text-sm py-4 text-center">No purchase requests found.</p>}
          </div>
        </TabsContent>

        <TabsContent value="won" className="space-y-3 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {wonVehicles.map(v => (
              <div key={v.id} className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{v.year} {v.make} {v.model}</p>
                  <Badge className="capitalize bg-green-500/20 text-green-400 text-xs">{v.status?.replace(/_/g, ' ')}</Badge>
                </div>
                <p className="text-xs font-mono text-muted-foreground">{v.vin}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Total Cost </span><span className="font-bold">{fmt(v.total_cost)}</span></div>
                  <div><span className="text-muted-foreground">Host </span><span>{v.host_email}</span></div>
                  <div><span className="text-muted-foreground">Source </span><span>{v.auction_source}</span></div>
                  <div><span className="text-muted-foreground">Purchased </span><span>{v.purchase_date}</span></div>
                </div>
              </div>
            ))}
            {wonVehicles.length === 0 && <p className="text-muted-foreground text-sm py-4 col-span-2 text-center">No won vehicles yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="sell" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            {['all', 'submitted', 'under_review', 'valuation_complete', 'offer_received', 'accepted', 'sold', 'cancelled'].map(s => (
              <button key={s} onClick={() => setSrFilter(s)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors capitalize ${srFilter === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-border/80'}`}>
                {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
                {s !== 'all' && <span className="ml-1.5 opacity-60">{sellRequests.filter(sr => sr.status === s).length}</span>}
              </button>
            ))}
          </div>
          {srLoading && <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>}
          <div className="space-y-2">
            {filteredSRs.map(sr => <AdminSellRow key={sr.id} sr={sr} onClick={() => setSelectedSR(sr)} />)}
            {!srLoading && filteredSRs.length === 0 && <p className="text-muted-foreground text-sm py-4 text-center">No sell requests found.</p>}
          </div>
        </TabsContent>

        <TabsContent value="listings" className="mt-4">
          <PublicListingsTab isAdmin={true} />
        </TabsContent>
      </Tabs>

      {/* Drawers */}
      <PurchaseRequestDrawer pr={selectedPR} open={!!selectedPR} onClose={() => setSelectedPR(null)} isAdmin={true} onRefresh={refresh} />
      <SellRequestDrawer sr={selectedSR} open={!!selectedSR} onClose={() => setSelectedSR(null)} isAdmin={true} onRefresh={refresh} />
    </div>
  );
}