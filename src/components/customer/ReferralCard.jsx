import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Gift, Copy, Check, Share2, Zap, Users, TrendingUp, Wallet } from "lucide-react";

const APP_URL = "https://uridehub.com";

function generateCode(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).toUpperCase().padStart(8, "0").slice(0, 8);
}

const STATUS_STYLE = {
  pending:   { label: "Signed Up",    dot: "bg-amber-400" },
  signed_up: { label: "Signed Up",    dot: "bg-amber-400" },
  booked:    { label: "Booked",       dot: "bg-blue-400" },
  active:    { label: "Active",       dot: "bg-green-500" },
  credited:  { label: "Credited 💰",  dot: "bg-pink-500" },
  voided:    { label: "Voided",       dot: "bg-gray-300" },
};

export default function ReferralCard({ user }) {
  const [copied, setCopied] = useState(false);

  const myCode = generateCode(user.email);
  const referralLink = `${APP_URL}/book-now?ref=${myCode}`;

  const { data: myReferralCode } = useQuery({
    queryKey: ["my-referral-code", user.email],
    queryFn: async () => {
      const existing = await base44.entities.ReferralCode.filter({ user_email: user.email });
      if (existing.length > 0) return existing[0];
      return base44.entities.ReferralCode.create({
        user_email: user.email,
        user_id: user.id,
        user_name: user.full_name || "",
        code: myCode,
        total_referrals: 0,
        total_credits_earned: 0,
        total_credits_used: 0,
      });
    },
    enabled: !!user?.email,
  });

  const { data: referrals = [] } = useQuery({
    queryKey: ["my-referrals", user.email],
    queryFn: () => base44.entities.Referral.filter({ referrer_email: user.email }),
    enabled: !!user?.email,
  });

  const creditsEarned = myReferralCode?.total_credits_earned || 0;
  const creditsUsed = myReferralCode?.total_credits_used || 0;
  const creditsAvailable = Math.max(0, creditsEarned - creditsUsed);

  const handleCopy = () => {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: "Rent for Free with uRide!",
        text: `Use my referral link to get $25 off your first week! 🚗`,
        url: referralLink,
      });
    } else {
      handleCopy();
    }
  };

  return (
    <div className="mx-5 mb-5 space-y-3">

      {/* ── Hero card ── */}
      <div className="rounded-3xl overflow-hidden bg-white shadow-sm border border-gray-100">

        {/* Gradient header */}
        <div className="px-5 pt-5 pb-4 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #ff3a8c 0%, #9333ea 100%)" }}>
          {/* Decorative blobs */}
          <div className="absolute -top-6 -right-6 h-28 w-28 rounded-full opacity-20"
            style={{ background: "rgba(255,255,255,0.4)" }} />
          <div className="absolute -bottom-4 -left-4 h-20 w-20 rounded-full opacity-10"
            style={{ background: "rgba(255,255,255,0.4)" }} />

          {/* Icon + title */}
          <div className="flex items-center gap-3 mb-2 relative z-10">
            <div className="h-11 w-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <Gift className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-lg leading-tight">Rent for Free</p>
              <p className="text-white/80 text-xs font-medium">Share → Earn → Save</p>
            </div>
          </div>

          {/* Tagline */}
          <p className="text-white/90 text-sm leading-relaxed relative z-10">
            Refer a friend and <span className="font-bold text-white underline decoration-white/40 decoration-dotted">both of you get $25 off</span>. The more friends you refer, the less you pay each week. 🚗
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 bg-gray-50 border-b border-gray-100">
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-green-600">${creditsAvailable}</p>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Available</p>
          </div>
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-gray-800">${creditsEarned}</p>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Total Earned</p>
          </div>
          <div className="py-4 text-center">
            <p className="text-xl font-bold text-gray-800">{referrals.length}</p>
            <p className="text-[11px] text-gray-500 font-medium mt-0.5">Referred</p>
          </div>
        </div>

        {/* Referral link block */}
        <div className="p-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Your Referral Link</p>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5 mb-3">
            <p className="text-xs text-gray-600 font-mono truncate flex-1">{referralLink}</p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all border-2 border-gray-200 text-gray-700 hover:border-pink-300 hover:text-pink-600 active:scale-[0.97] bg-white"
            >
              {copied
                ? <><Check className="h-4 w-4 text-green-500" /><span className="text-green-600">Copied!</span></>
                : <><Copy className="h-4 w-4" />Copy Link</>
              }
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-white transition-all active:scale-[0.97] shadow-sm"
              style={{ background: "linear-gradient(135deg, #ff3a8c, #9333ea)" }}
            >
              <Share2 className="h-4 w-4" />Share Now
            </button>
          </div>
        </div>

        {/* How it works */}
        <div className="mx-5 mb-5 rounded-2xl bg-pink-50 border border-pink-100 p-4">
          <p className="text-xs font-bold text-pink-700 mb-2.5 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> How it works
          </p>
          <div className="space-y-2">
            {[
              { step: "1", text: "Share your link with friends" },
              { step: "2", text: "They book a vehicle → you both get $25" },
              { step: "3", text: "Credit auto-applies to your next payment" },
            ].map(({ step, text }) => (
              <div key={step} className="flex items-center gap-2.5">
                <div className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #ff3a8c, #9333ea)" }}>
                  {step}
                </div>
                <p className="text-xs text-pink-800 font-medium">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Referral history ── */}
      {referrals.length > 0 && (
        <div className="rounded-3xl bg-white border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Users className="h-4 w-4 text-pink-500" />
            <p className="text-sm font-bold text-gray-800">Your Referrals</p>
            <span className="ml-auto text-xs font-bold text-white px-2 py-0.5 rounded-full"
              style={{ background: "linear-gradient(135deg, #ff3a8c, #9333ea)" }}>
              {referrals.length}
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {referrals.map((r) => {
              const s = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
              return (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, #ff3a8c, #9333ea)" }}>
                    {r.referee_name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{r.referee_name || r.referee_email}</p>
                    <p className="text-xs text-gray-400 truncate">{r.referee_email}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.status === "credited" && (
                      <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">+$25</span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${s.dot}`} />
                      <span className="text-xs font-semibold text-gray-600">{s.label}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}