import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Car, Search, Gavel, Eye, ShoppingCart, RefreshCw, Settings, ShieldCheck } from "lucide-react";

const tabs = [
  ["dashboard", "Dashboard", Car], ["source", "Source Vehicles", Search], ["bids", "Bid Center", Gavel], ["watchlist", "Watchlist", Eye], ["purchases", "Purchased", ShoppingCart], ["liquidate", "Liquidate", RefreshCw], ["settings", "Settings", Settings],
];

export default function DealerNetworkWorkspace({ scope = "host", hostId }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const filter = scope === "admin" ? {} : { host_id: hostId };
  const enabled = scope === "admin" || !!hostId;

  const { data: memberships = [] } = useQuery({ queryKey: ["dealer-memberships", scope, hostId], queryFn: () => base44.entities.DealerNetworkMembership.filter(filter), enabled });
  const { data: searches = [] } = useQuery({ queryKey: ["dealer-searches", scope, hostId], queryFn: () => base44.entities.DealerVehicleSearchRequest.filter(filter), enabled });
  const { data: bids = [] } = useQuery({ queryKey: ["dealer-bids", scope, hostId], queryFn: () => base44.entities.DealerBidRequest.filter(filter), enabled });
  const { data: liquidations = [] } = useQuery({ queryKey: ["dealer-liquidations", scope, hostId], queryFn: () => base44.entities.DealerLiquidationRequest.filter(filter), enabled });

  const createSearch = useMutation({ mutationFn: () => base44.entities.DealerVehicleSearchRequest.create({ host_id: hostId, requested_make: "Toyota", requested_model: "Corolla", budget_max: 10000, intended_use: "rental", status: "submitted", notes: "Manual sourcing request — no auction API submission activated." }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dealer-searches", scope, hostId] }) });
  const createBid = useMutation({ mutationFn: () => base44.entities.DealerBidRequest.create({ host_id: hostId, vehicle_identifier: "Manual bid intent", max_bid_amount: 5000, estimated_auction_fees: 850, estimated_transport: 900, no_pay_risk_reserve: 700, authorization_hold_amount: 7500, platform_purchase_fee: 50, bid_status: "draft", payment_hold_status: "estimate_only", notes: "Not submitted to auction yet. Admin/API submission pending future activation." }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dealer-bids", scope, hostId] }) });
  const createLiquidation = useMutation({ mutationFn: () => base44.entities.DealerLiquidationRequest.create({ host_id: hostId, desired_sale_channel: "internal_marketplace", ai_wholesale_estimate: 8000, asking_price: 8500, platform_fee_amount: 50, liquidation_status: "submitted", notes: "Guidance only — no real auction submission activated." }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dealer-liquidations", scope, hostId] }) });

  const stats = useMemo(() => [
    ["Memberships", memberships.length], ["Search Requests", searches.length], ["Bid Requests", bids.length], ["Liquidations", liquidations.length],
  ], [memberships, searches, bids, liquidations]);

  return (
    <div className="space-y-5">
      <div className="rounded-3xl p-5 text-white" style={{ background: "linear-gradient(135deg, #0f0c29, #302b63)" }}>
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-white/40 uppercase tracking-wider">uRideHub ecosystem app</p><h1 className="text-2xl font-black mt-1" style={{ fontFamily: "var(--font-syne)" }}>Dealer Network</h1><p className="text-white/60 text-sm mt-2">Source, buy, liquidate, and trade vehicles. Foundation mode only — no real auction bids or Stripe holds are active.</p></div><ShieldCheck className="h-8 w-8 text-pink-300" /></div>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">{tabs.map(([id, label, Icon]) => <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap flex items-center gap-1.5 ${tab === id ? "bg-pink-600 text-white" : "bg-white text-gray-500 border border-gray-100"}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}</div>
      {tab === "dashboard" && <Dashboard stats={stats} />}
      {tab === "source" && <ActionList title="Vehicle Search Requests" items={searches} action={scope === "host" ? () => createSearch.mutate() : null} actionLabel="Create Search Request" />}
      {tab === "bids" && <ActionList title="Bid Requests" items={bids} action={scope === "host" ? () => createBid.mutate() : null} actionLabel="Create Bid Request" />}
      {tab === "watchlist" && <Placeholder title="Watchlist" text="Saved wholesale vehicles will appear here when auction integrations are approved later." />}
      {tab === "purchases" && <Placeholder title="Purchased Vehicles" text="Completed manual/future API purchases will be tracked here." />}
      {tab === "liquidate" && <ActionList title="Liquidation Requests" items={liquidations} action={scope === "host" ? () => createLiquidation.mutate() : null} actionLabel="Request Liquidation" />}
      {tab === "settings" && <Placeholder title="Dealer Network Settings" text="$100/year membership, $50 platform fee per purchased/sold vehicle, plus actual auction/transport/listing fees. Billing setup is pending and not activated here." />}
    </div>
  );
}

function Dashboard({ stats }) { return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{stats.map(([label, value]) => <div key={label} className="rounded-2xl bg-white border border-gray-100 p-4"><p className="text-2xl font-black text-gray-900">{value}</p><p className="text-xs text-gray-400 mt-1">{label}</p></div>)}</div>; }
function Placeholder({ title, text }) { return <div className="rounded-2xl bg-white border border-gray-100 p-5"><p className="font-black text-gray-900">{title}</p><p className="text-sm text-gray-500 mt-2">{text}</p></div>; }
function ActionList({ title, items, action, actionLabel }) { return <div className="rounded-2xl bg-white border border-gray-100 p-5 space-y-3"><div className="flex items-center justify-between gap-3"><p className="font-black text-gray-900">{title}</p>{action && <button onClick={action} className="px-3 py-2 rounded-xl bg-pink-600 text-white text-xs font-black">{actionLabel}</button>}</div>{items.length === 0 ? <p className="text-sm text-gray-400">No records yet.</p> : items.map(item => <div key={item.id} className="rounded-xl bg-gray-50 p-3 text-sm"><p className="font-bold text-gray-800">{item.vehicle_identifier || item.requested_make || item.vin || item.desired_sale_channel || "Dealer Network record"}</p><p className="text-xs text-gray-400 mt-1">Status: {item.status || item.bid_status || item.liquidation_status || item.membership_status || "pending"}</p></div>)}</div>; }