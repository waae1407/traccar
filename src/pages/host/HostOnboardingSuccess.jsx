import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Copy, ExternalLink, Share2, LayoutDashboard, Car } from "lucide-react";

export default function HostOnboardingSuccess() {
  const [copied, setCopied] = useState(false);
  const hostId = new URLSearchParams(window.location.search).get("host_id");

  const { data, isLoading } = useQuery({
    queryKey: ["host-onboarding-success", hostId],
    queryFn: async () => {
      const user = await base44.auth.me();
      const hosts = hostId
        ? await base44.entities.Host.filter({ id: hostId })
        : await base44.entities.Host.filter({ email: user.email });
      const host = hosts?.[0];
      if (!host?.id) return { user, host: null, brand: null, plan: null };

      const [brands, plans] = await Promise.all([
        base44.entities.HostBrandSettings.filter({ host_id: host.id }, "-updated_date", 1),
        base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, "-updated_date", 1),
      ]);

      return { user, host, brand: brands?.[0] || null, plan: plans?.[0] || null };
    },
  });

  const brand = data?.brand;
  const host = data?.host;
  const plan = data?.plan;
  const storefrontPath = brand?.business_slug ? `/host/${brand.business_slug}` : "/host/brand";
  const storefrontUrl = brand?.business_slug ? `${window.location.origin}/host/${brand.business_slug}` : "";

  const copyLink = async () => {
    if (!storefrontUrl) return;
    await navigator.clipboard.writeText(storefrontUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareStore = async () => {
    if (!storefrontUrl) return;
    if (navigator.share) await navigator.share({ title: brand?.business_display_name || "My uRide Store", url: storefrontUrl });
    else await copyLink();
  };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading your storefront…</div>;
  }

  if (!host || !brand) {
    return (
      <div className="p-6">
        <Card className="max-w-xl mx-auto">
          <CardContent className="p-6 text-center">
            <h1 className="text-xl font-bold">Storefront not found</h1>
            <p className="text-sm text-muted-foreground mt-2">We could not find a live storefront for this host account.</p>
            <Button asChild className="mt-4"><Link to="/host/dashboard">Go To Host Dashboard</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 lg:p-8 bg-gray-50 text-gray-950">
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="rounded-[2rem] text-white p-6 sm:p-8 shadow-xl" style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 55%, #e91e8c 130%)" }}>
          <div className="h-14 w-14 rounded-2xl bg-white/15 flex items-center justify-center mb-5">
            <CheckCircle2 className="h-8 w-8 text-emerald-300" />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.22em] text-white/50">Self-service setup complete</p>
          <h1 className="text-4xl sm:text-5xl font-black mt-2" style={{ fontFamily: "var(--font-syne)" }}>🚀 Your Rental Business Is Open</h1>
          <p className="text-white/75 text-lg mt-3">{brand.business_display_name || host.business_name} is approved and your storefront is live.</p>

          <div className="mt-6 rounded-2xl bg-white/10 border border-white/10 p-4">
            <p className="text-xs text-white/45 uppercase font-black tracking-wider mb-2">Your storefront is live:</p>
            <p className="font-mono text-base break-all text-white">{storefrontUrl}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
            <a href={storefrontPath} target="_blank" rel="noreferrer" className="rounded-2xl bg-white text-gray-950 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-gray-50">
              <ExternalLink className="h-4 w-4" /> Open Store
            </a>
            <button onClick={copyLink} className="rounded-2xl bg-white/10 border border-white/15 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-white/20">
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy Link"}
            </button>
            <button onClick={shareStore} className="rounded-2xl bg-white/10 border border-white/15 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-white/20">
              <Share2 className="h-4 w-4" /> Share Store
            </button>
          </div>
        </div>

        <Card className="bg-white border-gray-100 shadow-sm">
          <CardContent className="p-5 grid sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-gray-400 font-black uppercase text-xs">Host Status</p>
              <p className="font-black text-emerald-600 mt-1 capitalize">{host.status}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-gray-400 font-black uppercase text-xs">Storefront</p>
              <p className="font-black text-emerald-600 mt-1 capitalize">{brand.published_status}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <p className="text-gray-400 font-black uppercase text-xs">Plan</p>
              <p className="font-black text-gray-900 mt-1">{plan?.selected_mode?.replaceAll("_", " ") || "Marketplace Partner"}</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid sm:grid-cols-2 gap-3">
          <Button asChild className="rounded-2xl h-12 font-black">
            <Link to="/host/dashboard"><LayoutDashboard className="h-4 w-4 mr-2" /> Go To Host Dashboard</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl h-12 font-black bg-white">
            <Link to="/host/vehicles"><Car className="h-4 w-4 mr-2" /> Add First Vehicle</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}