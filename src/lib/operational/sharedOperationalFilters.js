export const OPERATIONAL_MODES = {
  HOST: "host",
  ADMIN: "admin",
};

export const SHARED_DATE_RANGES = [
  { value: "all", label: "All Time" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "last30", label: "Last 30 Days" },
  { value: "last90", label: "Last 90 Days" },
  { value: "this_year", label: "This Year" },
];

export const SHARED_OPERATIONAL_FILTERS = {
  host: { key: "hostId", label: "Host", adminOnly: true },
  vehicle: { key: "vehicleId", label: "Vehicle" },
  booking: { key: "bookingId", label: "Booking" },
  customer: { key: "customer", label: "Customer" },
  dateRange: { key: "dateRange", label: "Date Range" },
  status: { key: "status", label: "Status" },
  category: { key: "category", label: "Category" },
  search: { key: "search", label: "Search" },
};

export function getOperationalFilterDefinitions(mode = OPERATIONAL_MODES.HOST) {
  return Object.values(SHARED_OPERATIONAL_FILTERS).filter((filter) => mode === OPERATIONAL_MODES.ADMIN || !filter.adminOnly);
}

export function assertOperationalScope({ mode = OPERATIONAL_MODES.HOST, hostId, user } = {}) {
  if (mode === OPERATIONAL_MODES.HOST && !hostId) {
    throw new Error("Host mode requires a hostId to prevent cross-host data exposure.");
  }
  if (mode === OPERATIONAL_MODES.ADMIN && user?.role !== "admin") {
    throw new Error("Admin mode requires confirmed admin access.");
  }
}

export function getEffectiveOperationalFilters(mode = OPERATIONAL_MODES.HOST, filters = {}, defaults = {}) {
  if (mode === OPERATIONAL_MODES.ADMIN) {
    return { dateRange: defaults.adminDateRange || "last30", ...filters };
  }
  return { ...filters };
}

export function getDateRangeBounds(range) {
  const now = new Date();
  const start = new Date(now);

  if (!range || range === "all") return null;
  if (range === "this_week") start.setDate(now.getDate() - now.getDay());
  if (range === "this_month") start.setDate(1);
  if (range === "last30") start.setDate(now.getDate() - 30);
  if (range === "last90") start.setDate(now.getDate() - 90);
  if (range === "this_year") start.setMonth(0, 1);

  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

export function isWithinSharedDateRange(dateValue, range) {
  const bounds = getDateRangeBounds(range);
  if (!bounds || !dateValue) return true;
  const date = new Date(dateValue);
  return date >= bounds.start && date <= bounds.end;
}

export function textMatches(value, search) {
  if (!search) return true;
  return String(value || "").toLowerCase().includes(String(search).toLowerCase());
}