const CANONICAL_HOSTS = ["localhost", "127.0.0.1", "uridehub.com", "www.uridehub.com"];

export function isCustomDomainHost() {
  const host = window.location.hostname.toLowerCase();
  return !CANONICAL_HOSTS.includes(host) && !host.includes("base44") && !host.includes("localhost");
}

export function canonicalCheckoutUrl(params) {
  const query = params instanceof URLSearchParams ? params.toString() : String(params || "");
  return `https://uridehub.com/checkout${query ? `?${query}` : ""}`;
}