import React from "react";

export default function BusinessPortalMobileDrawer({ open, onClose }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
      onClick={onClose}
    />
  );
}