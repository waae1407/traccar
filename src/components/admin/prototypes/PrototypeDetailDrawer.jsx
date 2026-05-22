import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export default function PrototypeDetailDrawer({ title, record, open, onOpenChange, fields = [] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-background border-white/10 text-white overflow-y-auto w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-white">{title}</SheetTitle>
        </SheetHeader>
        {record && (
          <div className="mt-6 space-y-3">
            {fields.map((field) => (
              <div key={field.key} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{field.label}</p>
                <p className="text-sm text-white mt-1 break-words">{field.render ? field.render(record) : (record[field.key] || "—")}</p>
              </div>
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}