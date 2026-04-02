import React, { useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { LogIn, UserPlus, ArrowRight } from "lucide-react";

export default function StepAccount({ user, booking, vehicleId, bookingType, vehicles, saveAndAdvance }) {
  const navigate = useNavigate();

  // If already logged in, auto-advance
  useEffect(() => {
    if (user && booking?.id) {
      saveAndAdvance({ user_email: user.email, user_id: user.id }, "profile");
    }
  }, [user, booking?.id]);

  if (user) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <div className="h-14 w-14 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mb-4"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {user.full_name?.charAt(0) || "U"}
        </div>
        <p className="font-bold text-gray-900 text-lg">Welcome, {user.full_name?.split(" ")[0]}!</p>
        <p className="text-gray-400 text-sm mt-1">Setting up your booking…</p>
        <div className="w-8 h-8 border-4 border-pink-200 border-t-pink-600 rounded-full animate-spin mt-6" />
      </div>
    );
  }

  const redirectUrl = vehicleId
    ? `/checkout?vehicle=${vehicleId}&type=${bookingType}`
    : "/checkout";

  return (
    <div>
      <h2 className="font-bold text-gray-900 text-xl mb-1">Sign in to continue</h2>
      <p className="text-gray-400 text-sm mb-6">You'll need an account to complete your booking. Your selections are saved.</p>

      <div className="space-y-3">
        <button
          onClick={() => base44.auth.redirectToLogin(redirectUrl)}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl text-white font-bold text-sm transition-all active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          <div className="flex items-center gap-3">
            <LogIn className="h-5 w-5" />
            <div className="text-left">
              <p>Sign In</p>
              <p className="text-xs font-normal opacity-80">I already have an account</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5" />
        </button>

        <button
          onClick={() => base44.auth.redirectToLogin(redirectUrl)}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl border-2 border-gray-200 text-gray-800 font-bold text-sm hover:border-pink-300 transition-all active:scale-[0.98]">
          <div className="flex items-center gap-3">
            <UserPlus className="h-5 w-5 text-pink-600" />
            <div className="text-left">
              <p>Create Account</p>
              <p className="text-xs font-normal text-gray-400">New to uRide</p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      <div className="mt-6 p-4 rounded-2xl bg-blue-50 border border-blue-100">
        <p className="text-xs text-blue-700 font-medium">
          🔒 Your vehicle selection and dates are saved. Sign in or create a free account to continue — takes under 60 seconds.
        </p>
      </div>
    </div>
  );
}