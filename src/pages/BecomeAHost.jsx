import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { ArrowRight, Building2, Store } from "lucide-react";
import PlanChoiceCard from "@/components/host/onboarding/PlanChoiceCard";
import StorefrontSuccessPanel from "@/components/host/onboarding/StorefrontSuccessPanel";
import PostSignupChecklist from "@/components/host/onboarding/PostSignupChecklist";
import SelectedSetupSummaryCard from "@/components/host/onboarding/SelectedSetupSummaryCard";
import { clearPendingAction, clearTaskDraft, EXPIRATION_MS, prepareAuthResume, savePendingAction, saveTaskDraft } from "@/lib/sessionContinuity";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";
const DRAFT_KEY = "instant_host_onboarding_draft";
const ONBOARDING_DRAFT_KEY = "host_onboarding:create_store";

const OPTIONS = [
  {
    id: "marketplace_partner",
    goal: "Get customers",
    label: "Let uRide Bring You Customers",
    price: "8% per completed booking",
    bullets: ["We bring renters", "Payments handled", "Contracts handled", "Paid automatically"],
  },
  {
    id: "fleetos_professional",
    goal: "Manage my fleet",
    label: "Run My Own Rental Business",
    price: "$29.99/month",
    bullets: ["Own your customers", "Own your operation", "Own your payments", "Control vehicles remotely"],
  },
  {
    id: "hybrid_growth",
    goal: "Both",
    label: "Grow Faster With Both",
    price: "$29.99/month + 5%",
    bullets: ["Marketplace renters", "Your own customers", "One operating system", "Remote vehicle control"],
  },
];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "your-store";
}

export default function BecomeAHost() {
  const { user, checkAppState } = useAuth();
  const navigate = useNavigate();
  const [selectedMode, setSelectedMode] = useState("marketplace_partner");
  const [storeName, setStoreName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const resumeAttemptedRef = useRef(false);

  const clearOnboardingState = () => {
    sessionStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_KEY);
    clearPendingAction();
    clearTaskDraft(ONBOARDING_DRAFT_KEY);
  };

  const routeToSuccess = (hostId) => {
    navigate(`/host/onboarding-success?host_id=${hostId}`, { replace: true });
  };

  useEffect(() => {
    if (!user?.email || resumeAttemptedRef.current) return;

    const rawPending = sessionStorage.getItem(DRAFT_KEY) || localStorage.getItem(DRAFT_KEY);
    if (!rawPending) return;

    const pending = JSON.parse(rawPending);
    if (pending?.intended_action !== "create_store" || !pending?.store_name) return;

    resumeAttemptedRef.current = true;
    const resumeOnboarding = async () => {
      const existingHosts = await base44.entities.Host.filter({ email: user.email });
      const approvedHost = existingHosts?.find((host) => host.status === "approved");
      if (approvedHost?.id) {
        const storefronts = await base44.entities.HostBrandSettings.filter({ host_id: approvedHost.id });
        const liveStorefront = storefronts?.find((storefront) => storefront.published_status === "live");
        if (liveStorefront?.id) {
          clearOnboardingState();
          await checkAppState?.();
          routeToSuccess(approvedHost.id);
          return;
        }
      }

      const payload = {
        store_name: pending.store_name,
        selected_mode: pending.selected_plan || pending.selected_mode || "marketplace_partner",
        requested_slug: pending.generated_slug || pending.requested_slug || slugify(pending.store_name),
      };

      setSelectedMode(payload.selected_mode);
      setStoreName(payload.store_name);
      await createStore(payload);
    };

    resumeOnboarding().catch((err) => {
      setError(err?.response?.data?.error || err.message || "Could not create your store. Please try again.");
      setLoading(false);
      resumeAttemptedRef.current = false;
    });
  }, [user?.email]); // eslint-disable-line

  const selectedOption = OPTIONS.find((option) => option.id === selectedMode) || OPTIONS[0];
  const previewSlug = useMemo(() => slugify(storeName), [storeName]);

  const createStore = async (payload) => {
    setLoading(true);
    setError("");
    const res = await base44.functions.invoke("instantHostOnboarding", payload);
    clearOnboardingState();
    await checkAppState?.();
    if (res.data?.subscription_checkout_url || res.data?.url) {
      window.location.href = res.data.subscription_checkout_url || res.data.url;
      return;
    }
    setResult(res.data);
    setLoading(false);
    navigate(`/host/onboarding-success?host_id=${res.data.host_id}`, { replace: true, state: { onboardingResult: res.data } });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = { store_name: storeName, selected_mode: selectedMode, requested_slug: previewSlug };
    if (!storeName.trim()) return setError("Store name is required.");

    if (!user) {
      const pendingOnboarding = JSON.stringify({
        selected_plan: selectedMode,
        store_name: storeName,
        generated_slug: previewSlug,
        intended_action: "create_store",
        timestamp: new Date().toISOString(),
      });
      sessionStorage.setItem(DRAFT_KEY, pendingOnboarding);
      localStorage.setItem(DRAFT_KEY, pendingOnboarding);
      savePendingAction({
        action_type: "create_store",
        route: "/become-a-host",
        entity_type: "Host",
        current_step: "create_store",
        form_state: { selected_plan: selectedMode, store_name: storeName, generated_slug: previewSlug },
      });
      saveTaskDraft(ONBOARDING_DRAFT_KEY, { selected_plan: selectedMode, store_name: storeName, generated_slug: previewSlug }, { route: "/become-a-host", entity_type: "Host", expires_in_ms: EXPIRATION_MS.activeDraft });
      prepareAuthResume({ pathname: "/become-a-host", search: "" }, user, { pending_action: { action_type: "create_store", route: "/become-a-host" } });
      base44.auth.redirectToLogin(`${window.location.origin}/become-a-host`);
      return;
    }

    try {
      await createStore(payload);
    } catch (err) {
      setError(err?.response?.data?.error || err.message || "Could not create your store.");
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>
        <Header />
        <main className="max-w-2xl mx-auto px-5 py-6 space-y-5">
          <StorefrontSuccessPanel result={result} />
          <PostSignupChecklist mode={result.selected_mode} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" style={{ fontFamily: "var(--font-inter)" }}>
      <Header />
      <main className="max-w-5xl mx-auto px-5 py-6 lg:py-10">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-6 items-start">
          <section>
            <h1 className="text-3xl sm:text-5xl font-black text-gray-950 mt-3 leading-tight" style={{ fontFamily: "var(--font-syne)" }}>
              Launch your rental business in under 30 seconds
            </h1>
            <p className="text-gray-500 mt-3 max-w-xl">Create your rental business now. Add vehicles, payments, GPS, and branding when you're ready.</p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-3">
                {OPTIONS.map((option) => (
                  <PlanChoiceCard key={option.id} option={option} selected={selectedMode === option.id} onSelect={setSelectedMode} />
                ))}
              </div>

              <div className="rounded-3xl bg-white border border-gray-100 p-4 space-y-3">
                <label className="block">
                  <span className="text-xs font-black text-gray-500 uppercase tracking-wider">Store Name *</span>
                  <div className="mt-2 relative">
                    <Store className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="Joe's Rentals" required className="w-full rounded-2xl bg-gray-50 border border-gray-200 pl-11 pr-4 py-3.5 text-gray-900 focus:outline-none focus:border-pink-400" />
                  </div>
                </label>

                {!user && (
                  <p className="text-xs text-gray-400 -mt-1">We’ll ask you to sign in after you choose your store name.</p>
                )}

                <div className="rounded-2xl bg-pink-50 border border-pink-100 p-3">
                  <p className="text-xs font-bold text-pink-700">Your Storefront URL</p>
                  <p className="font-mono text-sm text-gray-900 mt-1 break-all">uridehub.com/host/{previewSlug}</p>
                  <p className="text-xs text-pink-600 font-semibold mt-2 flex items-center gap-1">✓ Store name available</p>
                </div>

                {error && <div className="rounded-2xl bg-red-50 border border-red-100 p-3 text-sm text-red-600">{error}</div>}

                <button disabled={loading} className="w-full rounded-2xl py-4 text-white font-black flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                  {loading ? "Creating Store…" : "Create My Store"} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>
          </section>

          <aside className="lg:sticky lg:top-20 rounded-[2rem] text-white p-6 shadow-xl" style={{ background: "linear-gradient(160deg, #0f0c29 0%, #302b63 60%, #e91e8c 140%)" }}>
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <p className="text-xs font-black text-white/45 uppercase tracking-[0.2em]">Selected setup</p>
            <h2 className="text-2xl font-black mt-2" style={{ fontFamily: "var(--font-syne)" }}>{selectedOption.label}</h2>
            <p className="text-white/60 text-sm mt-1">{selectedOption.price}</p>
            <div className="mt-5 space-y-2">
              {selectedOption.bullets.map((bullet) => <p key={bullet} className="text-sm text-white/80">✓ {bullet}</p>)}
            </div>
            <SelectedSetupSummaryCard />
          </aside>
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-5xl mx-auto px-5 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO_ICON} alt="uRide" className="h-7 w-7 rounded-lg object-cover" />
          <span className="font-black text-gray-900 text-base" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
        </Link>
        <button onClick={() => {
          prepareAuthResume(window.location, null);
          base44.auth.redirectToLogin(window.location.href);
        }} className="text-sm font-bold text-gray-500 hover:text-gray-900">Sign In</button>
      </div>
    </header>
  );
}