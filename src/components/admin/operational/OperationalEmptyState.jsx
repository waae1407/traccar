import React from "react";

export default function OperationalEmptyState({ icon: Icon, title = "No records found", description, action }) {
  return (
    <div className="text-center py-12 px-4">
      {Icon && <Icon className="h-9 w-9 text-white/20 mx-auto mb-3" />}
      <p className="text-sm font-semibold text-white/70">{title}</p>
      {description && <p className="text-xs text-white/35 mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}