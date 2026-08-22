import React from "react";
import ContractViewer from "@/components/contracts/ContractViewer";

export default function ContractModal({ booking, onClose }) {
  if (!booking) return null;
  return <ContractViewer booking={booking} onClose={onClose} viewerRole="customer" />;
}