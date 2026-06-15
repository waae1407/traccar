import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Copy, ExternalLink, Share2, LayoutDashboard, Car, Info } from "lucide-react";
import PostSignupChecklist from "@/components/host/onboarding/PostSignupChecklist";

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

      const [brands, plans, subscriptions] = await Promise.all([
        base44.entities.HostBrandSettings.filter({ host_id: host.id }, "-updated_date", 1),
        base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }, "-updated_date", 1),
        base44.entities.HostPlatformSubscription.filter({ host_id: host.id }, "-updated_date", 1),
      ]);

      return { user, host, brand: brands?.[0] || null, plan: plans?.[0] || null, subscription: subscriptions?.[0] || null };
    },
  });

  const brand = data?.brand;
  const host = data?.host;
  const plan = data?.plan;
  const subscription = data?.subscription;
  const isPaidPlan = ["fleetos_professional", "hybrid_growth"].includes(plan?.selected_mode || plan?.active_mode);
  const planMode = plan?.selected_mode || plan?.active_mode || "marketplace_partner";
  const trialEndDate = subscription?.trial_end_date || subscription?.current_period_end;
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
          <h1 className="text-4xl sm:text-5xl font-black mt-2" style={{ fontFamily: "var(--font-syne)" }}>🎉 YOUR BUSINESS IS OPEN</h1>
          <p className="text-white/75 text-lg mt-3">
            Your store is live. Add your first vehicle to start accepting bookings.
          </p>
          {isPaidPlan && !trialEndDate && (
            <p className="text-emerald-300 font-semibold mt-2 text-sm">✓ Advanced tools selected. Activate billing anytime from Business Operations.</p>
          )}
          {isPaidPlan && trialEndDate && <p className="text-white/90 font-bold mt-2">Trial ends on: {new Date(trialEndDate).toLocaleDateString()}</p>}

          <div className="mt-6 rounded-2xl bg-white/10 border border-white/10 p-4">
            <p className="text-xs text-white/45 uppercase font-black tracking-wider mb-2">Your storefront is live:</p>
            <p className="font-mono text-base break-all text-white">{storefrontUrl}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
            <Link to="/host/vehicles/setup" className="rounded-2xl bg-white text-gray-950 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-gray-50">
              <Car className="h-4 w-4" /> Add First Vehicle
            </Link>
            <button onClick={copyLink} className="rounded-2xl bg-white/10 border border-white/15 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-white/20">
              <Copy className="h-4 w-4" /> {copied ? "Copied" : "Copy Link"}
            </button>
            <a href={storefrontPath} target="_blank" rel="noreferrer" className="rounded-2xl bg-white/10 border border-white/15 font-black text-sm py-3 flex items-center justify-center gap-2 hover:bg-white/20">
              <ExternalLink className="h-4 w-4" /> View Storefront
            </a>
          </div>
        </div>

        <Card className="bg-white border-gray-100 shadow-sm">
          <CardContent className="p-5 space-y-4 text-sm">
            {isPaidPlan && (
              <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4 flex gap-3">
                <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-blue-800 text-sm">You selected advanced tools. <strong>No payment is needed now.</strong> When you're ready, activate billing from <Link to="/host/business-operations" className="underline font-bold">Business Operations</Link>.</p>
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-3">
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
            </div>
          </CardContent>
        </Card>

        <PostSignupChecklist mode={planMode} />

        <div className="grid sm:grid-cols-2 gap-3">
          <Button asChild className="rounded-2xl h-12 font-black">
            <Link to="/host/vehicles/setup"><Car className="h-4 w-4 mr-2" /> Add First Vehicle</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl h-12 font-black bg-white">
            <Link to="/host/dashboard"><LayoutDashboard className="h-4 w-4 mr-2" /> Go To Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}