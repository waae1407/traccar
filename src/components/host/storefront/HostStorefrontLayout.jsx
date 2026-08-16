import React, { useEffect } from "react";
import { Outlet, Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Home, CalendarDays, Activity, HelpCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

// Inject/update a <meta> or <link> tag in <head>. When the tag already exists
// (by attrKey/attrValue), update its content; otherwise create it.
function upsertHeadTag(tagName, attrKey, attrValue, contentKey, content) {
  let el = document.head.querySelector(`${tagName}[${attrKey}="${attrValue}"]`);
  if (!el) {
    el = document.createElement(tagName);
    el.setAttribute(attrKey, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute(contentKey, content);
  return el;
}

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

  // Dynamically inject the host's logo as the favicon and Open Graph share
  // preview image so that when the storefront URL is shared on social media
  // or messaging apps, the host's brand appears instead of the default
  // uRideHub logo from index.html.
  useEffect(() => {
    if (!logoUrl) return;
    upsertHeadTag("link", "rel", "icon", "href", logoUrl);
    upsertHeadTag("link", "rel", "apple-touch-icon", "href", logoUrl);
    upsertHeadTag("meta", "property", "og:image", "content", logoUrl);
    upsertHeadTag("meta", "property", "og:title", "content", displayName);
    upsertHeadTag("meta", "property", "og:description", "content", brand?.hero_subtitle || brand?.about_text || `Book your next ride with ${displayName}`);
    upsertHeadTag("meta", "property", "og:url", "content", window.location.href);
    upsertHeadTag("meta", "name", "twitter:card", "content", "summary_large_image");
    upsertHeadTag("meta", "name", "twitter:image", "content", logoUrl);
    upsertHeadTag("meta", "name", "twitter:title", "content", displayName);
  }, [logoUrl, displayName, brand?.hero_subtitle, brand?.about_text]);

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

  const isActive = (tabPath) =>
    location.pathname === tabPath ||
    (tabPath !== base && tabPath !== "/" && location.pathname.startsWith(tabPath)) ||
    (tabPath === base && location.pathname === base);

  return (
    <div className="min-h-screen flex flex-col" style={{ fontFamily: "var(--font-inter)", background: "#f8f8fa", color: "#111827" }}>
      {/* Top bar — responsive, unified container */}
      <header className="sticky top-0 z-40 w-full"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="mx-auto w-full max-w-6xl px-5 md:px-8 h-16 md:h-20 flex items-center justify-between">
          <Link to={base} className="flex items-center gap-2.5 group active:scale-95 transition-transform">
            {logoUrl
              ? <img src={logoUrl} alt={displayName}
                  className="h-12 w-12 md:h-16 md:w-16 lg:h-20 lg:w-20 rounded-full object-contain shadow-md ring-1 ring-black/5 bg-white group-hover:shadow-lg transition-shadow" />
              : <>
                  <div className="h-10 w-10 md:h-14 md:w-14 lg:h-16 lg:w-16 rounded-xl flex items-center justify-center text-white font-bold text-lg md:text-xl lg:text-2xl shadow-sm"
                      style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }}>
                    {displayName.charAt(0)}
                  </div>
                </>}
            {/* Wordmark — visible on md+ alongside logo */}
            <span className={cn("font-black tracking-tight hidden md:inline", logoUrl ? "text-gray-900 text-xl lg:text-2xl" : "text-gray-900 text-lg md:text-xl lg:text-2xl")}
              style={{ fontFamily: "var(--font-syne)" }}>
              {displayName}
            </span>
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {tabs.map((tab) => {
              const active = isActive(tab.path);
              return (
                <Link key={tab.path} to={tab.path}
                  className="flex items-center gap-1.5 px-3 lg:px-4 py-2 rounded-full text-sm font-semibold transition-all"
                  style={{
                    background: active ? `${brandColor}14` : "transparent",
                    color: active ? brandColor : "#6b7280",
                  }}>
                  <tab.icon style={{ height: 16, width: 16 }} strokeWidth={active ? 2.5 : 1.8} />
                  <span className="hidden lg:inline">{tab.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Account icon — desktop */}
          <Link to={`${base}/account`} className="hidden md:flex">
            <div className="h-10 w-10 lg:h-11 lg:w-11 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
              style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }}>
              <User className="h-4 w-4" />
            </div>
          </Link>

          {/* Account icon — mobile */}
          <Link to={`${base}/account`} className="md:hidden">
            <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm"
              style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }}>
              <User className="h-4 w-4" />
            </div>
          </Link>
        </div>
      </header>

      {/* Page content — force light theme so child pages don't inherit dark global CSS vars */}
      <main className="flex-1 pb-28 md:pb-12" style={{
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

      {/* Footer — desktop only */}
      <footer className="hidden md:block border-t" style={{ borderColor: "rgba(0,0,0,0.06)", background: "#fff" }}>
        <div className="mx-auto w-full max-w-6xl px-8 py-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {logoUrl
              ? <img src={logoUrl} alt={displayName} className="h-8 w-8 rounded-full object-contain" />
              : <div className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }}>{displayName.charAt(0)}</div>}
            <span className="font-bold text-gray-700 text-sm" style={{ fontFamily: "var(--font-syne)" }}>{displayName}</span>
          </div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-medium">
            <span>Powered by</span>
            <span className="font-bold text-gray-600">uRideHub</span>
          </Link>
        </div>
      </footer>

      {/* Powered by uRideHub strip — mobile only */}
      <div className="md:hidden fixed bottom-[72px] left-0 right-0 z-40 flex justify-center pointer-events-none">
        <Link to="/" className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 backdrop-blur-sm border border-gray-200/70 shadow-sm mb-1">
          <span className="text-[10px] text-gray-400 font-medium">Powered by</span>
          <span className="text-[10px] font-bold text-gray-600">uRideHub</span>
        </Link>
      </div>

      {/* Bottom nav — mobile only, branded colors */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px)", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
        <div className="flex items-center justify-around h-[72px] w-full max-w-2xl mx-auto px-1">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            return (
              <Link key={tab.path} to={tab.path}
                className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all min-w-[60px] relative"
                style={{ color: active ? brandColor : "#9ca3af" }}>
                {active && (
                  <span className="absolute top-1 inset-x-2 h-0.5 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${brandColor}, ${secondaryColor})` }} />
                )}
                <div className="h-8 w-8 rounded-xl flex items-center justify-center transition-all"
                  style={{ background: active ? `${brandColor}18` : "transparent" }}>
                  <tab.icon style={{ height: 18, width: 18, color: active ? brandColor : "#9ca3af" }}
                    strokeWidth={active ? 2.5 : 1.8} />
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