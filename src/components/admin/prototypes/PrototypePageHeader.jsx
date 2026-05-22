import React from "react";

export default function PrototypePageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary font-bold">Operations</p>
        <h1 className="font-syne text-3xl text-white mt-2">{title}</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}