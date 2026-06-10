import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import HostPageHeader from "@/components/host/HostPageHeader";
import PaymentOperationsAlertCenter from "@/components/payments/PaymentOperationsAlertCenter";
import HostWalletSection from "@/components/host/HostWalletSection";

export default function HostPaymentAlerts() {
  const { user } = useAuth();
  const { data: hosts = [] } = useQuery({ queryKey: ["host-alert-center-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email });
  const host = hosts[0];
  return (
    <div className="space-y-5">
      <HostPageHeader title="Payment Alerts" subtitle="Action-required payment issues for your fleet" />
      <HostWalletSection />
      <PaymentOperationsAlertCenter scope="host" hostId={host?.id} />
    </div>
  );
}