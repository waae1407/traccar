import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import {
  clearAuthResume,
  exposeContinuityApi,
  getResumeTarget,
  isMeaningfulRoute,
  readContinuity,
  roleDefaultRoute,
  saveLastRoute,
  SESSION_KEYS,
} from "@/lib/sessionContinuity";

export default function SessionContinuityManager() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isLoadingAuth, isLoadingPublicSettings, navigateToLogin } = useAuth();
  const [connectionMessage, setConnectionMessage] = useState("");
  const [resumeMessage, setResumeMessage] = useState("");

  const currentRoute = useMemo(() => `${location.pathname}${location.search || ""}`, [location.pathname, location.search]);

  useEffect(() => {
    exposeContinuityApi();
  }, []);

  useEffect(() => {
    if (!user || isLoadingAuth || isLoadingPublicSettings) return;
    saveLastRoute(location, user);
  }, [location, user, isLoadingAuth, isLoadingPublicSettings]);

  useEffect(() => {
    if (!user || isLoadingAuth || isLoadingPublicSettings) return;
    const authResume = readContinuity(SESSION_KEYS.authResume);
    if (!authResume) return;

    const target = getResumeTarget(user);
    clearAuthResume();

    if (target && target !== currentRoute && target !== roleDefaultRoute(user)) {
      setResumeMessage("Welcome back — continuing where you left off.");
      navigate(target, { replace: true });
      setTimeout(() => setResumeMessage(""), 3500);
    }
  }, [user, isLoadingAuth, isLoadingPublicSettings, currentRoute, navigate]);

  useEffect(() => {
    if (!isMeaningfulRoute(location.pathname)) return;
    const saveBeforeUnload = () => saveLastRoute(location, user);
    window.addEventListener("beforeunload", saveBeforeUnload);
    return () => window.removeEventListener("beforeunload", saveBeforeUnload);
  }, [location, user]);

  useEffect(() => {
    const offline = () => setConnectionMessage("You’re offline. We’ll keep your progress on this device.");
    const online = () => {
      setConnectionMessage("Back online. Restoring your latest progress.");
      queryClient.invalidateQueries();
      setTimeout(() => setConnectionMessage(""), 3500);
    };

    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    if (!navigator.onLine) offline();

    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [queryClient]);

  useEffect(() => {
    const handleAuthFailure = (event) => {
      const error = event?.reason || event?.detail || event;
      const status = error?.status || error?.response?.status;
      const reason = error?.data?.extra_data?.reason || error?.response?.data?.extra_data?.reason;
      if (status === 401 || reason === "auth_required") {
        saveLastRoute(location, user);
        navigateToLogin();
      }
    };

    window.addEventListener("unhandledrejection", handleAuthFailure);
    return () => window.removeEventListener("unhandledrejection", handleAuthFailure);
  }, [location, user, navigateToLogin]);

  const message = resumeMessage || connectionMessage;
  if (!message) return null;

  return (
    <div className="fixed top-4 left-1/2 z-[1000] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-white/15 bg-slate-950/90 px-4 py-3 text-center text-sm font-semibold text-white shadow-2xl backdrop-blur">
      {message}
    </div>
  );
}