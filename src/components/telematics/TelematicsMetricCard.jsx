import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function TelematicsMetricCard({ label, value, icon: Icon, tone = "text-primary", onClick, active = false }) {
  const content = (
    <CardContent className="p-4">
      {Icon && <Icon className={`h-5 w-5 mb-2 ${tone}`} />}
      <p className="text-2xl font-black">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </CardContent>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left">
        <Card className={`glass transition-all hover:border-primary/40 hover:-translate-y-0.5 ${active ? "border-primary/50 ring-1 ring-primary/30" : ""}`}>
          {content}
        </Card>
      </button>
    );
  }

  return <Card className="glass">{content}</Card>;
}