import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Navigate } from "react-router-dom";
import { AlertTriangle, Home } from "lucide-react";

const CANONICAL_HOSTS = ["localhost", "127.0.0.1", "uridehub.com", "www.uridehub.com"];

function normalizeHost() {
  return window.location.hostname.toLowerCase().replace(/\.$/, "");
}

export function isCustomDomainHost() {
  const host = normalizeHost();
  return !CANONICAL_HOSTS.includes(host) && !host.includes("base44") && !host.includes("localhost");
}

export function canonicalUrl(path = "/") {
  return `https://uridehub.com${path.startsWith("/") ? path : `/${path}`}`;
}

export default function CustomDomainGate({ children }) {
  const hostname = normalizeHost();
  const pathname = window.location.pathname;

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["custom-domain-resolver", hostname],
    queryFn: () => base44.entities.HostCustomDomain.filter({ normalized_domain: hostname }),
    enabled: isCustomDomainHost(),
    retry: false,
  });

  if (!isCustomDomainHost()) return children || null;

  // Checkout must always run on the canonical domain (Stripe, session, etc).
  // Redirect immediately without waiting for the domain resolver query.
  if (pathname.startsWith("/checkout")) {
    window.location.replace(canonicalUrl(`${pathname}${window.location.search}`));
    return null;
  }

  // If the path is already at a storefront route (/host/:slug), render children
  // immediately — don't block on the domain resolver query. The
  // HostStorefrontLayout will fetch brand settings by slug directly.
  if (pathname.startsWith("/host/")) return children || null;

  // For "/" and other paths, we need the resolver query to know the slug.
  // Show a minimal branded loading page (not blank white) while it fetches.
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#f8f8fa" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "#e5e7eb", borderTopColor: "#e91e8c" }} />
        </div>
      </div>
    );
  }

  const record = records[0];
  if (record?.active && record?.verification_status === "verified" && record?.business_slug) {
    const storefrontBase = `/host/${record.business_slug}`;
    if (pathname === "/") return <Navigate to={storefrontBase} replace />;
    if (pathname.startsWith("/checkout")) {
      window.location.replace(canonicalUrl(`${pathname}${window.location.search}`));
      return null;
    }
    if (!pathname.startsWith(storefrontBase)) return <Navigate to={storefrontBase} replace />;
    return children || null;
  }

  const fallbackPath = record?.business_slug ? `/host/${record.business_slug}` : "/";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5">
      <div className="max-w-sm w-full rounded-3xl bg-white border border-gray-100 shadow-sm p-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="h-7 w-7 text-amber-500" />
        </div>
        <h1 className="text-xl font-black text-gray-900 mb-2">Domain not active yet</h1>
        <p className="text-sm text-gray-500 leading-relaxed mb-5">This branded domain is not verified or active. To protect bookings, please continue through the official uRide storefront.</p>
        <a href={canonicalUrl(fallbackPath)} className="w-full py-3 rounded-2xl font-bold text-sm text-white flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <Home className="h-4 w-4" /> Continue on uRide
        </a>
      </div>
    </div>
  );
}