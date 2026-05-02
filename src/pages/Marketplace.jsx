import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Car, DollarSign, MapPin, Search, Tag, Zap } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

const conditionColors = {
  excellent: "bg-green-500/20 text-green-400",
  good: "bg-blue-500/20 text-blue-400",
  fair: "bg-yellow-500/20 text-yellow-400",
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
    <div className="min-h-screen text-white" style={{ background: "hsl(222 28% 7%)" }}>
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-full" />
          <span className="font-bold text-lg font-syne">uRide Marketplace</span>
        </Link>
        <Link to="/book-now" className="px-4 py-2 rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Rent a Car
        </Link>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-semibold mb-4">
            <Tag className="h-3 w-3" /> Phase 2 — Vehicle Marketplace
          </div>
          <h1 className="text-4xl font-black font-syne mb-3">Vehicles For Sale</h1>
          <p className="text-white/40">Buy directly from verified uRide hosts. All vehicles pre-screened.</p>
        </div>

        <div className="flex gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
            <input className="w-full pl-9 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-primary/50"
              placeholder="Search make, model, city..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <input type="number" placeholder="Max price" className="w-36 px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-primary/50"
            value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="grid md:grid-cols-3 gap-6">{[1,2,3,4,5,6].map(i => <div key={i} className="h-64 rounded-2xl bg-white/[0.04] animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Car className="h-14 w-14 text-white/20 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-white mb-2">No listings yet</h3>
            <p className="text-white/40 text-sm">The vehicle marketplace is coming soon. Check back or become a host to list your vehicles.</p>
            <Link to="/become-a-host" className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-xl text-sm font-bold text-white gradient-primary">
              Become a Host →
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-6">
            {filtered.map(l => (
              <div key={l.id} className="rounded-2xl border border-white/[0.08] glass overflow-hidden hover:border-primary/20 transition-all">
                {l.vehicle_image ? (
                  <img src={l.vehicle_image} alt={l.vehicle_name} className="w-full h-44 object-cover" />
                ) : (
                  <div className="w-full h-44 bg-white/[0.04] flex items-center justify-center">
                    <Car className="h-12 w-12 text-white/20" />
                  </div>
                )}
                <div className="p-5">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-white">{l.year} {l.make} {l.model}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold capitalize ${conditionColors[l.condition] || "bg-white/10 text-white/60"}`}>{l.condition}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-white/40 mb-3">
                    <MapPin className="h-3 w-3" /> {l.city}, {l.state}
                    {l.mileage && <span className="ml-2">· {l.mileage?.toLocaleString()} mi</span>}
                  </div>
                  {l.description && <p className="text-xs text-white/40 mb-4 line-clamp-2">{l.description}</p>}
                  <div className="flex items-center justify-between">
                    <p className="text-xl font-black text-white">${l.asking_price?.toLocaleString()}</p>
                    <a href={`mailto:info@uridehub.com?subject=Inquiry: ${l.year} ${l.make} ${l.model}&body=Listing ID: ${l.id}`}
                      className="px-4 py-2 rounded-xl text-sm font-bold text-white gradient-primary hover:opacity-90 transition-all">
                      Inquire
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}