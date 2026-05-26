import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import DealerNetworkWorkspace from "@/components/dealer/DealerNetworkWorkspace";

export default function HostDealerNetwork() {
  const { user } = useAuth();
  const { data: hosts = [] } = useQuery({ queryKey: ["host-dealer-network-host", user?.email], queryFn: () => base44.entities.Host.filter({ email: user.email }), enabled: !!user?.email });
  const host = hosts[0];
  if (!host) return <div className="rounded-2xl bg-white border border-gray-100 p-5 text-gray-500">Host profile required.</div>;
  return <DealerNetworkWorkspace scope="host" hostId={host.id} />;
}