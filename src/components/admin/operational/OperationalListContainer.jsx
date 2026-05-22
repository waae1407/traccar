import React from "react";
import OperationalSectionCard from "./OperationalSectionCard";
import OperationalEmptyState from "./OperationalEmptyState";

export default function OperationalListContainer({ title, subtitle, count, loading, emptyIcon, emptyTitle, emptyDescription, children }) {
  return (
    <OperationalSectionCard title={title} subtitle={subtitle || (count !== undefined ? `${count.toLocaleString()} record${count === 1 ? "" : "s"}` : undefined)}>
      {loading ? (
        <div className="p-4 space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-14 rounded-2xl bg-white/[0.06] animate-pulse" />)}</div>
      ) : count === 0 ? (
        <OperationalEmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      ) : children}
    </OperationalSectionCard>
  );
}