import React from "react";
import { Card, CardContent } from "@/components/ui/card";

export default function TelematicsMetricCard({ label, value, icon: Icon, tone = "text-primary" }) {
  return (
    <Card className="glass">
      <CardContent className="p-4">
        {Icon && <Icon className={`h-5 w-5 mb-2 ${tone}`} />}
        <p className="text-2xl font-black">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}