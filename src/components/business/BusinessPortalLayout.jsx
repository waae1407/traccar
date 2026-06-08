import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";
import BusinessPortalSidebar from "@/components/business/BusinessPortalSidebar";
import BusinessPortalTopBar from "@/components/business/BusinessPortalTopBar";
import HostAlarmAttentionBanner from "@/components/host/HostAlarmAttentionBanner";
import HostSubscriptionBanner from "@/components/host/HostSubscriptionBanner";

export default function BusinessPortalLayout({ role = "admin" }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const isHost = role === "host";

  const { data: hosts = [] } = useQuery({
    queryKey: ["business-portal-host", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: isHost && !!user?.email,
  });
  const host = hosts[0];

  const { data: plans = [] } = useQuery({
    queryKey: ["business-portal-plan", host?.id],
    queryFn: () => base44.entities.OperatorPlanConfiguration.filter({ host_id: host.id }),
    enabled: isHost && !!host?.id,
  });
  const plan = plans[0];

  const paidMode = ["fleetos_professional", "hybrid_growth"].includes(plan?.selected_mode || plan?.active_mode);
  const subscriptionExpired = paidMode && ["expired", "cancelled", "canceled"].includes(plan?.status);
  const lockedHostPaths = ["/host/payments", "/host/payouts", "/host/pnl", "/host/reports", "/host/fleet-insights", "/host/telematics", "/host/vehicle-command-center", "/host/telematics-command-test", "/host/dealer-network"];
  const lockedRoute = isHost && subscriptionExpired && lockedHostPaths.some((path) => location.pathname === path || location.pathname.startsWith(path + "/"));
  const showDealerNetwork = !isHost || plan?.dealer_network_enabled || ["pending_payment", "active"].includes(plan?.dealer_network_membership_status);

  return (
    <div className="min-h-screen mesh-bg">
      <BusinessPortalSidebar
        role={role}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        showDealerNetwork={showDealerNetwork}
      />
      <div className={cn("transition-all duration-300 ease-in-out", collapsed ? "lg:ml-[72px]" : "lg:ml-64")}>
        <BusinessPortalTopBar role={role} onMenuClick={() => setMobileOpen(true)} />
        <main className="p-4 md:p-6 lg:p-8 min-h-[calc(100vh-70px)]">
          {isHost && (
            <div className="mb-5 space-y-5">
              <HostAlarmAttentionBanner host={host} />
              <HostSubscriptionBanner host={host} plan={plan} />
            </div>
          )}
          {lockedRoute ? (
            <div className="rounded-3xl border border-red-500/20 bg-card/90 p-6 text-center shadow-card max-w-2xl mx-auto">
              <h1 className="text-xl font-black text-foreground">Your subscription is inactive.</h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">Reactivate your plan to continue operating FleetOS tools, revenue dashboards, GPS controls, and marketplace exposure. Your storefront and business data remain intact.</p>
              <Link to="/host/business-operations" className="inline-flex items-center justify-center mt-5 rounded-2xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground">Reactivate Subscription</Link>
            </div>
          ) : <Outlet />}
        </main>
      </div>
    </div>
  );
}