export const isAdmin = (user) => user?.role === "admin";
export const isCustomer = (user) => !user || user?.role === "customer";

export const ADMIN_ROUTES = [
  "/dashboard", "/customers", "/vehicles", "/payments",
  "/rent-to-own", "/maintenance", "/reports",
  "/bookings-admin",
];

export const CUSTOMER_ROUTES = [
  "/", "/book-now", "/my-bookings", "/activity", "/account",
];