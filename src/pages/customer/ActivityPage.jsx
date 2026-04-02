import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { DollarSign, FileText, ShieldCheck, Bell, Activity } from "lucide-react";
import { format } from "date-fns";
import StatusBadge from "@/components/shared/StatusBadge";

export default function ActivityPage() {
  const { user } = useOutletContext() || {};

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["my-payments", user?.email],
    queryFn: () => base44.entities.Payment.filter({ created_by: user?.email }),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Activity className="h-7 w-7 text-gray-400" />
        </div>
        <h3 className="font-bold text-gray-900 text-lg">Sign in to view activity</h3>
        <p className="text-gray-400 text-sm mt-2">Payments, documents, and contract updates will show here.</p>
        <a href="/account" className="mt-5 px-6 py-2.5 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          Sign In
        </a>
      </div>
    );
  }

  const totalPaid = payments.filter((p) => p.status === "Paid").reduce((s, p) => s + (p.amount || 0), 0);

  return (
    <div className="px-4 py-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="h-8 w-8 rounded-xl bg-green-50 flex items-center justify-center mb-2">
            <DollarSign className="h-4 w-4 text-green-600" />
          </div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Paid</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">${totalPaid.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center mb-2">
            <FileText className="h-4 w-4 text-blue-600" />
          </div>
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Payments</p>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{payments.length}</p>
        </div>
      </div>

      {/* ID Verification status */}
      <div className={`p-4 rounded-2xl border mb-6 ${user.driver_license_url ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
        <div className="flex items-center gap-3">
          <ShieldCheck className={`h-5 w-5 ${user.driver_license_url ? "text-green-600" : "text-yellow-600"}`} />
          <div>
            <p className="font-semibold text-sm text-gray-900">
              {user.driver_license_url ? "ID Verified" : "ID Verification Pending"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {user.driver_license_url
                ? "Your identity has been verified."
                : "Upload your license to complete verification."}
            </p>
          </div>
        </div>
      </div>

      {/* Payment history */}
      <h2 className="font-bold text-gray-900 text-base mb-3">Payment History</h2>
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-400 text-sm">No payments yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${p.status === "Paid" ? "bg-green-50" : "bg-yellow-50"}`}>
                  <DollarSign className={`h-4 w-4 ${p.status === "Paid" ? "text-green-600" : "text-yellow-600"}`} />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{p.payment_type}</p>
                  <p className="text-xs text-gray-400">{p.paid_date ? format(new Date(p.paid_date), "MMM d, yyyy") : p.due_date ? `Due ${format(new Date(p.due_date), "MMM d")}` : "—"}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900">${p.amount?.toLocaleString()}</p>
                <StatusBadge status={p.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}