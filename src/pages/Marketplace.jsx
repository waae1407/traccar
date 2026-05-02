import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Car, MapPin, Search, Tag, ArrowRight, SlidersHorizontal } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const conditionConfig = {
  excellent: { label: "Excellent", color: "text-emerald-700", bg: "bg-emerald-50" },
  good: { label: "Good", color: "text-blue-700", bg: "bg-blue-50" },
  fair: { label: "Fair", color: "text-yellow-700", bg: "bg-yellow-50" },
};

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["marketplace-listings"],
    queryFn: () => base44.entities.VehicleSaleListing.filter({ status: "active" }),
  });

  const filtered = listings.filter(l => {
    const matchSearch = !search || `${l.make} ${l.model} ${l.city}`.toLowerCase().includes(search.toLowerCase());
    const matchPrice = !maxPrice || (l.asking_price || 0) <= Number(maxPrice);
    return matchSearch && matchPrice;
  });

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "var(--font-inter)" }}>
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
            <span className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
          </Link>
          <Link to="/book-now" className="px-4 py-2 rounded-full text-sm font-bold text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
            Rent a Car
          </Link>
        </div>
      </header>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(160deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)" }}>
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 20% 50%, hsl(338 90% 56% / 0.2) 0%, transparent 60%)" }} />
        <div className="relative z-10 max-w-5xl mx-auto px-5 py-14 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 text-white/80 text-xs font-bold mb-5">
            <Tag className="h-3 w-3 text-pink-400" /> Verified Host Vehicles For Sale
          </div>
          <h1 className="text-4xl font-black text-white mb-3" style={{ fontFamily: "var(--font-syne)" }}>Vehicle Marketplace</h1>
          <p className="text-white/50 text-sm max-w-sm mx-auto">Buy directly from verified uRide fleet owners. Every vehicle pre-screened.</p>
        </div>
        <div className="h-6"><svg viewBox="0 0 375 24" fill="white" className="w-full" preserveAspectRatio="none"><path d="M0 24L375 24L375 6C300 20 180 1 0 15L0 24Z"/></svg></div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all"
              placeholder="Search make, model, city…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="relative">
            <input type="number" placeholder="Max $"
              className="w-28 px-4 py-3 rounded-2xl bg-gray-50 border border-gray-200 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100"
              value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-4">{[1,2,3,4,5,6].map(i => <div key={i} className="h-72 rounded-3xl bg-gray-100 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-20 w-20 rounded-3xl bg-gray-100 flex items-center justify-center mb-5">
              <Car className="h-10 w-10 text-gray-300" />
            </div>
            <h3 className="text-xl font-black text-gray-900 mb-2" style={{ fontFamily: "var(--font-syne)" }}>No listings yet</h3>
            <p className="text-gray-400 text-sm mb-6">The marketplace is launching soon. Be first to list by becoming a host.</p>
            <Link to="/become-a-host" className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              Become a Host <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-4">
            {filtered.map(l => {
              const cond = conditionConfig[l.condition] || conditionConfig.good;
              return (
                <div key={l.id} className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden hover:shadow-md transition-all group">
                  {l.vehicle_image ? (
                    <div className="overflow-hidden h-48">
                      <img src={l.vehicle_image} alt={l.vehicle_name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <Car className="h-14 w-14 text-gray-300" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-black text-gray-900 text-sm">{l.year} {l.make} {l.model}</h3>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold capitalize ${cond.bg} ${cond.color}`}>{cond.label}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
                      <MapPin className="h-3 w-3" /> {l.city}, {l.state}
                      {l.mileage && <span className="ml-1">· {l.mileage?.toLocaleString()} mi</span>}
                    </div>
                    {l.description && <p className="text-xs text-gray-400 mb-4 line-clamp-2">{l.description}</p>}
                    <div className="flex items-center justify-between">
                      <p className="text-xl font-black text-gray-900" style={{ fontFamily: "var(--font-syne)" }}>${l.asking_price?.toLocaleString()}</p>
                      <a href={`mailto:info@uridehub.com?subject=Inquiry: ${l.year} ${l.make} ${l.model}&body=Listing ID: ${l.id}`}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                        style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                        Inquire
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}