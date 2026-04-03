/**
 * useTenant — central hook for multi-tenant data isolation.
 *
 * Returns:
 *  - companyId: the active company_id to filter all queries
 *  - isSuperadmin: true if current user is platform_superadmin
 *  - viewingCompanyId: for superadmins switching context, else same as companyId
 *  - tenantFilter(extraFilters): returns filter object always scoped to companyId
 *  - company: the current Company record (if loaded)
 */

import { useAuth } from "@/lib/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { create } from "zustand";

// Global store for superadmin tenant switching
export const useTenantStore = create((set) => ({
  overrideCompanyId: null, // null = use user's own company
  setOverrideCompanyId: (id) => set({ overrideCompanyId: id }),
}));

export function useTenant() {
  const { user } = useAuth();
  const { overrideCompanyId, setOverrideCompanyId } = useTenantStore();

  const isSuperadmin = user?.is_platform_superadmin === true;

  // The effective company_id to use for filtering
  const companyId = isSuperadmin
    ? (overrideCompanyId || user?.company_id || null)
    : (user?.company_id || null);

  // Load the current company record for branding
  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const results = await base44.entities.Company.filter({ id: companyId });
      return results[0] || null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });

  // Load all companies for superadmin switcher
  const { data: allCompanies = [] } = useQuery({
    queryKey: ["all-companies"],
    queryFn: () => base44.entities.Company.list(),
    enabled: isSuperadmin,
    staleTime: 60_000,
  });

  /**
   * tenantFilter(extraFilters?)
   * Returns a filter object that includes company_id scoping.
   * Superadmin with no override sees ALL (no company_id filter).
   * Superadmin with override sees that company.
   * Regular users always see only their company.
   */
  const tenantFilter = (extra = {}) => {
    if (isSuperadmin && !overrideCompanyId) {
      // No company_id filter — see everything
      return extra;
    }
    if (!companyId) return extra;
    return { company_id: companyId, ...extra };
  };

  const isAdminRole = user && ["admin", "staff", "manager", "booking_manager", "payment_manager", "support_agent", "maintenance_manager", "company_owner"].includes(user.role);

  return {
    companyId,
    isSuperadmin,
    isAdminRole,
    company,
    allCompanies,
    overrideCompanyId,
    setOverrideCompanyId,
    tenantFilter,
    user,
  };
}