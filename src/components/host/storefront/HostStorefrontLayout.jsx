import React from "react";
import { Outlet, Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Home, CalendarDays, Activity, HelpCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HostStorefrontLayout() {
  const { businessSlug } = useParams();
  const location = useLocation();

  const { data: brands = [] } = useQuery({
    queryKey: ["public-brand", businessSlug],
    queryFn: () => base44.entities.HostBrandSettings.filter({ business_slug: businessSlug }),
  });
  const brand = brands[0];

  const brandColor = brand?.brand_color || "#e91e8c";
  const secondaryColor = brand?.secondary_color || "#7c3aed";
  const logoUrl = brand?.logo_url;
  const displayName = brand?.business_display_name || "uRide";

  const base = `/host/${businessSlug}`;

  const showActivity = brand?.show_activity_tab !== false;
  const showSupport = brand?.show_support_tab !== false;

  const tabs = [
    { label: "Home", icon: Home, path: base },
    { label: "Bookings", icon: CalendarDays, path: "/my-bookings" },
    ...(showActivity ? [{ label: "Activity", icon: Activity, path: "/activity" }] : []),
    ...(showSupport ? [{ label: "Support", icon: HelpCircle, path: "/support" }] : []),
    { label: "Account", icon: User, path: "/account" },
  ];

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 px-5 h-16 flex items-center justify-between max-w-2xl mx-auto w-full"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex items-center gap-2.5">
          {logoUrl
            ? <img src={logoUrl} alt={displayName} className="h-8 w-8 rounded-xl object-cover shadow-sm" />
            : <div className="h-8 w-8 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-sm"
                style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }}>
                {displayName.charAt(0)}
              </div>}
          <span className="font-black text-gray-900 text-lg tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>
            {displayName}
          </span>
        </div>
        <Link to="/account">
          <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
            style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }}>
            <User className="h-4 w-4" />
          </div>
        </Link>
      </header>

      {/* Page content */}
      <main className="pb-28">
        <Outlet context={{ brand, businessSlug }} />
      </main>

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