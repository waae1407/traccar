import React from "react";
import { Outlet, Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Home, CalendarDays, Activity, HelpCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HostStorefrontLayout() {
  const { businessSlug } = useParams();
  const location = useLocation();
  const { user } = useAuth();

  const { data: brands = [] } = useQuery({
    queryKey: ["public-brand", businessSlug],
    queryFn: () => base44.entities.HostBrandSettings.filter({ business_slug: businessSlug }),
  });
  const brand = brands[0];

  const brandColor = brand?.brand_color || "#e91e8c";
  const secondaryColor = brand?.secondary_color || "#7c3aed";

  // Convert hex to HSL string for CSS variable injection
  const hexToHslStr = (hex) => {
    const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; } else {
      const d = max-min; s = l>0.5 ? d/(2-max-min) : d/(max+min);
      switch(max){ case r: h=(g-b)/d+(g<b?6:0); break; case g: h=(b-r)/d+2; break; default: h=(r-g)/d+4; }
      h /= 6;
    }
    return `${Math.round(h*360)} ${Math.round(s*100)}% ${Math.round(l*100)}%`;
  };
  const brandHsl = brandColor.startsWith("#") && brandColor.length === 7 ? hexToHslStr(brandColor) : "338 90% 56%";
  const logoUrl = brand?.logo_url;
  const displayName = brand?.business_display_name || "uRide";

  const base = `/host/${businessSlug}`;

  const showActivity = brand?.show_activity_tab !== false;
  const showSupport = brand?.show_support_tab !== false;

  const tabs = [
    { label: "Home", icon: Home, path: base },
    { label: "Bookings", icon: CalendarDays, path: `${base}/bookings` },
    ...(showActivity ? [{ label: "Activity", icon: Activity, path: `${base}/activity` }] : []),
    ...(showSupport ? [{ label: "Support", icon: HelpCircle, path: `${base}/support` }] : []),
    { label: "Account", icon: User, path: `${base}/account` },
  ];

  return (
    <div className="min-h-screen" style={{ fontFamily: "var(--font-inter)", background: "#f8f8fa", color: "#111827" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 px-5 h-16 flex items-center justify-between max-w-2xl mx-auto w-full"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <Link to={base} className="flex items-center gap-2.5 group active:scale-95 transition-transform">
          {logoUrl
            ? <img src={logoUrl} alt={displayName}
                className="h-12 w-12 rounded-full object-contain shadow-md ring-1 ring-black/5 bg-white p-0.5 group-hover:shadow-lg transition-shadow" />
            : <>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }}>
                  {displayName.charAt(0)}
                </div>
                <span className="font-black text-gray-900 text-lg tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>
                  {displayName}
                </span>
              </>}
        </Link>
        <Link to={`${base}/account`}>
          <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
            style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }}>
            <User className="h-4 w-4" />
          </div>
        </Link>
      </header>

      {/* Page content — force light theme so child pages don't inherit dark global CSS vars */}
      <main className="pb-28" style={{
        "--background": "0 0% 97%",
        "--foreground": "222 28% 7%",
        "--card": "0 0% 100%",
        "--card-foreground": "222 28% 7%",
        "--muted": "210 20% 96%",
        "--muted-foreground": "215 16% 47%",
        "--border": "214 32% 91%",
        "--primary": brandHsl,
        "--primary-foreground": "0 0% 100%",
        "--secondary": "210 40% 96%",
        "--secondary-foreground": "222 47% 11%",
        "--accent": "210 40% 96%",
        "--accent-foreground": "222 47% 11%",
        background: "#f8f8fa",
        color: "#111827",
      }}>
        <Outlet context={{ brand, businessSlug, user }} />
      </main>

      {/* Powered by uRideHub strip */}
      <div className="fixed bottom-[72px] left-0 right-0 z-40 flex justify-center pointer-events-none">
        <Link to="/" className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200/70 shadow-sm mb-1">
          <span className="text-[10px] text-gray-400 font-medium">Powered by</span>
          <span className="text-[10px] font-bold text-gray-600">uRideHub</span>
        </Link>
      </div>

      {/* Bottom nav — branded colors */}
      <nav className="fixed bottom-0 left-0 right-0 z-50"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex items-center justify-around h-[72px] w-full max-w-2xl mx-auto px-1">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.path ||
              (tab.path !== base && tab.path !== "/" && location.pathname.startsWith(tab.path)) ||
              (tab.path === base && location.pathname === base);
            return (
              <Link key={tab.path} to={tab.path}
                className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all min-w-[60px] relative"
                style={{ color: isActive ? brandColor : "#9ca3af" }}>
                {isActive && (
                  <span className="absolute top-1 inset-x-2 h-0.5 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }} />
                )}
                <div className="h-8 w-8 rounded-xl flex items-center justify-center transition-all"
                  style={{ background: isActive ? `${brandColor}18` : "transparent" }}>
                  <tab.icon style={{ height: 18, width: 18, color: isActive ? brandColor : "#9ca3af" }}
                    strokeWidth={isActive ? 2.5 : 1.8} />
                </div>
                <span className="text-[10px] font-bold tracking-wide leading-none">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}