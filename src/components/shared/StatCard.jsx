import React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function StatCard({ title, value, icon: Icon, color, subtitle }) {
  return (
    <Card className="p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <div className={cn("p-2.5 rounded-xl", color || "bg-primary/10")}>
          <Icon className={cn("h-5 w-5", color ? color.replace("bg-", "text-").replace("/10", "") : "text-primary")} />
        </div>
      </div>
    </Card>
  );
}