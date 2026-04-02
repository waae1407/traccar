import React from "react";
import { Navigate } from "react-router-dom";
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