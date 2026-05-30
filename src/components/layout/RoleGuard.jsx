import React from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export function AdminGuard({ children }) {
  const { user, isLoadingAuth, isLoadingPublicSettings } = useAuth();
  if (isLoadingAuth || isLoadingPublicSettings) return null;
  // Not logged in or not admin → redirect to customer home
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

export function CustomerGuard({ children }) {
  const { user, isLoadingAuth } = useAuth();
  if (isLoadingAuth) return null;
  if (!user) return <Navigate to="/account" replace />;
  return children;
}

export function HostGuard({ children }) {
  const { user, isLoadingAuth, isLoadingPublicSettings, navigateToLogin } = useAuth();
  const { data: hosts = [], isLoading } = useQuery({
    queryKey: ["host-guard", user?.email, user?.id],
    queryFn: () => base44.entities.Host.filter({ email: user.email }),
    enabled: !!user?.email && (user.role === "host" || user.role === "admin"),
  });

  if (isLoadingAuth || isLoadingPublicSettings || isLoading) return null;
  if (!user) { navigateToLogin(); return null; }
  if (user.role !== "host" && user.role !== "admin") return <Navigate to="/" replace />;

  const host = hosts.find((item) => item.email === user.email || item.user_id === user.id);
  if (!host) return <Navigate to="/become-a-host" replace />;
  if (host.status !== "approved") return <Navigate to="/become-a-host" replace />;
  if (host.booking_blocked || host.host_under_review || host.status === "suspended") {
    return <div className="min-h-screen flex items-center justify-center bg-background p-6"><div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center"><h1 className="text-xl font-bold">Host access restricted</h1><p className="mt-2 text-sm text-muted-foreground">Your host account is currently restricted or under review.</p></div></div>;
  }
  return children;
}

export function AdminOrInstallerGuard({ children }) {
  const { user, isLoadingAuth, isLoadingPublicSettings, navigateToLogin } = useAuth();
  if (isLoadingAuth || isLoadingPublicSettings) return null;
  if (!user) { navigateToLogin(); return null; }
  if (user.role !== "admin" && user.role !== "installer") return <Navigate to="/" replace />;
  return children;
}