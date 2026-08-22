import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ShieldCheck, FileText, PenLine, CheckCircle2, AlertCircle, Loader2, Lock } from "lucide-react";

export default function HostPlatformAgreement() {
  const { user } = useAuth();
  const [signatureName, setSignatureName] = useState("");
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState(null);

  // Fetch host record for this user
  const { data: hosts = [], isLoading: loadingHost } = useQuery({
    queryKey: ["host-by-email", user?.email],
    queryFn: () => base44.entities.Host.filter({ email: user?.email }),
    enabled: !!user?.email,
  });
  const host = hosts[0];

  // Fetch the agreement
  const { data: agreement, isLoading } = useQuery({
    queryKey: ["platform-agreement", host?.id],
    queryFn: async () => {
      const res = await base44.functions.invoke("generatePlatformAgreement", { host_id: host.id });
      return res.data || res;
    },
    enabled: !!host?.id,
  });

  const signMutation = useMutation({
    mutationFn: (data) => base44.functions.invoke("generatePlatformAgreement", data),
    onSuccess: (res) => {
      const data = res.data || res;
      if (data.ok || data.status === "signed") {
        setSigned(true);
      } else {
        setError(data.error || "Failed to sign agreement");
      }
    },
    onError: (e) => setError(e.message || "Failed to sign agreement"),
  });

  const handleSign = () => {
    if (!signatureName.trim() || signatureName.trim().length < 2) {
      setError("Please enter your full legal name");
      return;
    }
    setError(null);
    signMutation.mutate({
      host_id: host.id,
      action: "sign",
      signature_name: signatureName.trim(),
    });
  };

  if (loadingHost || isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (!host) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h2 className="font-bold text-gray-900 text-lg mb-2">No host account found</h2>
          <p className="text-gray-500 text-sm">You need a host account to view the platform agreement.</p>
        </div>
      </div>
    );
  }

  const isSigned = signed || agreement?.current_status === "signed";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => window.history.back()} className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <span className="text-gray-700 text-lg">←</span>
          </button>
          <div className="flex-1">
            <p className="font-bold text-gray-900 text-sm">Platform Agreement</p>
            <p className="text-xs text-gray-400">{agreement?.plan_label || "Loading..."} · {agreement?.agreement_version || ""}</p>
          </div>
          {isSigned ? (
            <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-3 py-1.5 rounded-full">
              <CheckCircle2 className="h-3.5 w-3.5" /> Signed
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full">
              <AlertCircle className="h-3.5 w-3.5" /> Action Required
            </span>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5">
        {/* Status banner */}
        {isSigned ? (
          <div className="mb-5 p-4 rounded-2xl border border-green-200 bg-green-50 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-green-900">Agreement Signed</p>
              <p className="text-xs text-green-700 mt-0.5">
                Signed by {agreement?.signature_name || user?.full_name} on{" "}
                {agreement?.signed_at ? new Date(agreement.signed_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : "N/A"}
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-5 p-4 rounded-2xl border border-amber-200 bg-amber-50 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-amber-900">Review &amp; Sign Required</p>
              <p className="text-xs text-amber-700 mt-0.5">
                This agreement defines your responsibilities as a host and uRide's role as the platform. Please review and sign to keep your account in good standing.
              </p>
            </div>
          </div>
        )}

        {/* Plan summary card */}
        <div className="mb-5 p-4 rounded-2xl border border-gray-200 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-pink-500" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Your Plan</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Plan</p>
              <p className="font-bold text-gray-900 text-sm">{agreement?.plan_label || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Commission</p>
              <p className="font-bold text-gray-900 text-sm">
                {agreement?.commission_rate === 0 ? "0% (SaaS)" : `${((agreement?.commission_rate || 0) * 100).toFixed(1)}%`}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Monthly Fee</p>
              <p className="font-bold text-gray-900 text-sm">
                ${((agreement?.monthly_subscription_amount || 0)).toFixed(2)}
                {(agreement?.monthly_subscription_amount || 0) === 0 ? " (free)" : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Version</p>
              <p className="font-bold text-gray-900 text-sm">{agreement?.agreement_version || "—"}</p>
            </div>
          </div>
        </div>

        {/* Full agreement document */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-gray-400" />
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Full Agreement</p>
          </div>
          <div
            className="bg-white rounded-2xl border border-gray-200 p-5 max-h-[50vh] overflow-y-auto text-sm shadow-inner"
            dangerouslySetInnerHTML={{ __html: agreement?.agreement_html || "<p>Loading agreement...</p>" }}
          />
        </div>

        {/* Signature section — only if not signed */}
        {!isSigned && (
          <>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                <PenLine className="inline h-3 w-3 mr-1" />Electronic Signature — Type Your Legal Full Name
              </label>
              <input
                className="w-full h-12 px-4 rounded-xl border border-gray-200 text-gray-900 focus:outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100 transition-all text-lg font-medium italic"
                placeholder="Your full legal name"
                value={signatureName}
                onChange={(e) => setSignatureName(e.target.value)}
              />
              <div className="flex items-center gap-2 mt-1.5">
                <Lock className="h-3 w-3 text-green-500 flex-shrink-0" />
                <p className="text-xs text-gray-400">
                  Electronic signature · Timestamp, device info &amp; IP address recorded · Legally binding
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-3 p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600">
                {error}
              </div>
            )}

            <button
              disabled={!signatureName.trim() || signMutation.isPending}
              onClick={handleSign}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
            >
              {signMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Signing...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" />Sign Platform Agreement</>
              )}
            </button>
          </>
        )}

        {/* Signed confirmation */}
        {isSigned && (
          <div className="p-5 rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">Agreement Active</p>
                <p className="text-xs text-gray-400">Your platform agreement is on file. You can view it anytime here.</p>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Signed by</span>
                <span className="font-semibold text-gray-700">{agreement?.signature_name || user?.full_name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Signed on</span>
                <span className="font-semibold text-gray-700">
                  {agreement?.signed_at ? new Date(agreement.signed_at).toLocaleString() : "N/A"}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Plan</span>
                <span className="font-semibold text-gray-700">{agreement?.plan_label}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Version</span>
                <span className="font-semibold text-gray-700">{agreement?.agreement_version}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}