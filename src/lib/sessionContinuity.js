const STORAGE_PREFIX = "uride_session_continuity";

export const SESSION_KEYS = {
  lastRoute: `${STORAGE_PREFIX}:last_route`,
  authResume: `${STORAGE_PREFIX}:auth_resume`,
  pendingAction: `${STORAGE_PREFIX}:pending_action`,
  drafts: `${STORAGE_PREFIX}:drafts`,
};

export const EXPIRATION_MS = {
  authResume: 30 * 60 * 1000,
  activeDraft: 24 * 60 * 60 * 1000,
  vehicleDraft: 7 * 24 * 60 * 60 * 1000,
  storefrontDraft: 7 * 24 * 60 * 60 * 1000,
};

const MEANINGLESS_PATHS = [
  "/privacy",
  "/terms",
  "/home",
];

const UNSAFE_AUTO_ACTIONS = new Set([
  "setup_payment",
  "send_vehicle_command",
  "connect_stripe",
  "payout_action",
  "sign_contract",
]);

export function nowIso() {
  return new Date().toISOString();
}

export function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getStorage(scope = "local") {
  if (typeof window === "undefined") return null;
  return scope === "session" ? window.sessionStorage : window.localStorage;
}

export function writeContinuity(key, value, { both = true } = {}) {
  const serialized = JSON.stringify(value);
  getStorage("session")?.setItem(key, serialized);
  if (both) getStorage("local")?.setItem(key, serialized);
}

export function readContinuity(key) {
  return safeJsonParse(getStorage("session")?.getItem(key), null) || safeJsonParse(getStorage("local")?.getItem(key), null);
}

export function clearContinuity(key) {
  getStorage("session")?.removeItem(key);
  getStorage("local")?.removeItem(key);
}

export function isExpired(item, maxAgeMs) {
  if (!item?.timestamp) return true;
  return Date.now() - new Date(item.timestamp).getTime() > maxAgeMs;
}

export function routeToString(locationLike) {
  const pathname = locationLike?.pathname || window.location.pathname;
  const search = locationLike?.search || window.location.search || "";
  return `${pathname}${search}`;
}

export function isMeaningfulRoute(pathname) {
  if (!pathname) return false;
  if (MEANINGLESS_PATHS.includes(pathname)) return false;
  if (pathname.includes("callback") || pathname.includes("logout") || pathname.includes("error")) return false;
  return true;
}

export function classifyPage(pathname) {
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/host")) return "host";
  if (pathname.startsWith("/checkout")) return "checkout";
  if (pathname.startsWith("/vehicle-command-center")) return "vehicle_command";
  if (pathname.startsWith("/my-bookings")) return "bookings";
  if (pathname.startsWith("/account")) return "account";
  if (pathname.startsWith("/become-a-host")) return "host_onboarding";
  return "general";
}

export function extractActiveRecordId(search = "") {
  const params = new URLSearchParams(search);
  const keys = ["request", "booking", "booking_id", "vehicle", "vehicle_id", "edit", "host", "host_id", "thread", "id"];
  for (const key of keys) {
    const value = params.get(key);
    if (value) return { key, value };
  }
  return null;
}

export function routeAllowedForRole(route, user) {
  if (!route || !user) return false;
  if (route.startsWith("/admin")) return user.role === "admin";
  if (route.startsWith("/host")) return user.role === "host" || user.role === "admin";
  return true;
}

export function roleDefaultRoute(user) {
  if (user?.role === "admin") return "/dashboard";
  if (user?.role === "host") return "/host/dashboard";
  return "/book-now";
}

export function saveLastRoute(location, user) {
  if (!isMeaningfulRoute(location?.pathname)) return;
  const payload = {
    pathname: location.pathname,
    search: location.search || "",
    route: routeToString(location),
    role_context: user?.role || "guest",
    page_type: classifyPage(location.pathname),
    active_record: extractActiveRecordId(location.search),
    timestamp: nowIso(),
  };
  writeContinuity(SESSION_KEYS.lastRoute, payload);
}

export function savePendingAction(action) {
  const payload = {
    action_type: action.action_type,
    route: action.route || `${window.location.pathname}${window.location.search}`,
    entity_type: action.entity_type || null,
    entity_id: action.entity_id || null,
    current_step: action.current_step || null,
    form_state: action.form_state || null,
    status: action.status || "pending",
    timestamp: nowIso(),
  };
  writeContinuity(SESSION_KEYS.pendingAction, payload);
  return payload;
}

export function clearPendingAction() {
  clearContinuity(SESSION_KEYS.pendingAction);
}

export function saveTaskDraft(draftKey, draft, options = {}) {
  const drafts = readContinuity(SESSION_KEYS.drafts) || {};
  drafts[draftKey] = {
    draft_key: draftKey,
    data: draft,
    route: options.route || `${window.location.pathname}${window.location.search}`,
    entity_type: options.entity_type || null,
    entity_id: options.entity_id || null,
    expires_in_ms: options.expires_in_ms || EXPIRATION_MS.activeDraft,
    timestamp: nowIso(),
  };
  writeContinuity(SESSION_KEYS.drafts, drafts);
}

export function readTaskDraft(draftKey) {
  const draft = (readContinuity(SESSION_KEYS.drafts) || {})[draftKey];
  if (!draft || isExpired(draft, draft.expires_in_ms || EXPIRATION_MS.activeDraft)) return null;
  return draft;
}

export function clearTaskDraft(draftKey) {
  const drafts = readContinuity(SESSION_KEYS.drafts) || {};
  delete drafts[draftKey];
  writeContinuity(SESSION_KEYS.drafts, drafts);
}

export function prepareAuthResume(location, user, extra = {}) {
  const lastRoute = {
    pathname: location?.pathname || window.location.pathname,
    search: location?.search || window.location.search || "",
    route: routeToString(location || window.location),
    role_context: user?.role || "guest",
    page_type: classifyPage(location?.pathname || window.location.pathname),
    active_record: extractActiveRecordId(location?.search || window.location.search),
    timestamp: nowIso(),
  };

  const payload = {
    last_route: lastRoute,
    pending_action: extra.pending_action || readContinuity(SESSION_KEYS.pendingAction),
    timestamp: nowIso(),
  };

  writeContinuity(SESSION_KEYS.authResume, payload);
  writeContinuity(SESSION_KEYS.lastRoute, lastRoute);
  return payload;
}

export function getResumeTarget(user) {
  const authResume = readContinuity(SESSION_KEYS.authResume);
  const lastRoute = authResume?.last_route || readContinuity(SESSION_KEYS.lastRoute);

  if (authResume && isExpired(authResume, EXPIRATION_MS.authResume)) {
    clearContinuity(SESSION_KEYS.authResume);
  }

  const candidate = lastRoute?.route;
  if (!candidate || !routeAllowedForRole(candidate, user)) return roleDefaultRoute(user);
  return candidate;
}

export function clearAuthResume() {
  clearContinuity(SESSION_KEYS.authResume);
}

export function canAutoResumeAction(action) {
  if (!action?.action_type) return false;
  return !UNSAFE_AUTO_ACTIONS.has(action.action_type);
}

export function exposeContinuityApi() {
  if (typeof window === "undefined") return;
  window.uRideSession = {
    savePendingAction,
    clearPendingAction,
    saveTaskDraft,
    readTaskDraft,
    clearTaskDraft,
    prepareAuthResume,
  };
}