import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Gift, Copy, Check, Users, DollarSign, Share2, ChevronRight, Clock } from "lucide-react";

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
  pending:  { label: "Signed Up", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  signed_up:{ label: "Signed Up", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
  booked:   { label: "Booked",    color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20" },
  active:   { label: "Active",    color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
  credited: { label: "💰 Credited", color: "text-primary",  bg: "bg-pink-500/10 border-pink-500/20" },
  voided:   { label: "Voided",    color: "text-white/30",   bg: "bg-white/5 border-white/10" },
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
      // Auto-create if doesn't exist
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
    <div className="mx-5 mb-5">
      {/* Hero Banner */}
      <div className="rounded-2xl overflow-hidden mb-3"
        style={{ background: "linear-gradient(135deg, hsl(338 90% 56% / 0.20) 0%, hsl(265 80% 62% / 0.15) 100%)", border: "1px solid hsl(338 90% 56% / 0.25)" }}>
        {/* Top gradient bar */}
        <div className="h-1" style={{ background: "linear-gradient(90deg, hsl(338 90% 56%), hsl(265 80% 62%))" }} />
        <div className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              <Gift className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-base" style={{ fontFamily: "var(--font-syne)" }}>
                🚗 Rent for Free Program
              </p>
              <p className="text-xs text-white/50">Refer friends → earn credits → pay less or nothing</p>
            </div>
          </div>

          <p className="text-xs text-white/60 leading-relaxed mb-4">
            Every friend who books using your link earns you <strong className="text-white">$25 in rental credit</strong>. They get <strong className="text-white">$25 off</strong> their first week too. Refer enough friends and <strong className="text-primary">your rent pays itself</strong>.
          </p>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="rounded-xl p-3 text-center border border-white/[0.08]" style={{ background: "hsl(222 24% 11%)" }}>
              <p className="text-lg font-bold text-green-400">${creditsAvailable}</p>
              <p className="text-[10px] text-white/40 mt-0.5">Available</p>
            </div>
            <div className="rounded-xl p-3 text-center border border-white/[0.08]" style={{ background: "hsl(222 24% 11%)" }}>
              <p className="text-lg font-bold text-white">${creditsEarned}</p>
              <p className="text-[10px] text-white/40 mt-0.5">Total Earned</p>
            </div>
            <div className="rounded-xl p-3 text-center border border-white/[0.08]" style={{ background: "hsl(222 24% 11%)" }}>
              <p className="text-lg font-bold text-white">{referrals.length}</p>
              <p className="text-[10px] text-white/40 mt-0.5">Referred</p>
            </div>
          </div>

          {/* Referral link */}
          <div className="rounded-xl border border-white/10 p-3 mb-3" style={{ background: "hsl(222 24% 9%)" }}>
            <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Your Referral Link</p>
            <p className="text-xs text-white/70 font-mono truncate mb-2">{referralLink}</p>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all border border-white/10 text-white/70 hover:text-white hover:border-white/20"
                style={{ background: "hsl(222 24% 13%)" }}>
                {copied ? <><Check className="h-3.5 w-3.5 text-green-400" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy Link</>}
              </button>
              <button
                onClick={handleShare}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-white transition-all"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                <Share2 className="h-3.5 w-3.5" />Share Now
              </button>
            </div>
          </div>

          {/* How it works */}
          <div className="flex items-start gap-2 text-[10px] text-white/30">
            <span>💡</span>
            <span>Credits auto-apply to your next weekly payment. Refer 4 friends and get a FREE week.</span>
          </div>
        </div>
      </div>

      {/* Referral history */}
      {referrals.length > 0 && (
        <div className="rounded-2xl border border-white/[0.07] overflow-hidden" style={{ background: "hsl(222 24% 11%)" }}>
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <p className="text-xs font-bold text-white/60 uppercase tracking-wider">Your Referrals</p>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {referrals.map((r) => {
              const s = STATUS_STYLE[r.status] || STATUS_STYLE.pending;
              return (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                      style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                      {r.referee_name?.charAt(0) || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{r.referee_name || r.referee_email}</p>
                      <p className="text-[10px] text-white/30 truncate">{r.referee_email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {r.status === "credited" && <span className="text-xs font-bold text-green-400">+$25</span>}
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>{s.label}</span>
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