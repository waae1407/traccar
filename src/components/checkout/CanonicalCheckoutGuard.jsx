import React from "react";

const CANONICAL_HOSTS = ["localhost", "127.0.0.1", "uridehub.com", "www.uridehub.com"];

function isCustomHost() {
  const host = window.location.hostname.toLowerCase();
  return !CANONICAL_HOSTS.includes(host) && !host.includes("base44") && !host.includes("localhost");
}

export default function CanonicalCheckoutGuard() {
  if (!isCustomHost()) return null;
  const target = `https://uridehub.com${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(target);
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-5">
      <div className="rounded-3xl bg-white border border-gray-100 shadow-sm p-6 text-center max-w-sm">
        <div className="h-8 w-8 border-4 border-gray-200 border-t-pink-500 rounded-full animate-spin mx-auto mb-4" />
        <h1 className="font-black text-gray-900 text-lg">Redirecting to secure uRide checkout</h1>
        <p className="text-sm text-gray-500 mt-2">Bookings, login, payments, contracts, and Stripe stay on uRide for your safety.</p>
      </div>
    </div>
  );
}