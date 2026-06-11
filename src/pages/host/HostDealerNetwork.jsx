import React from "react";
import { Link } from "react-router-dom";
import { ArrowRightLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * HostDealerNetwork — Legacy route (/host/dealer-network)
 *
 * This route is deprecated. The legacy Dealer Network workspace used placeholder entities
 * with no real Stripe holds or auction logic. All active acquisition and liquidation
 * workflows have moved to Dealer360.
 *
 * This page is intentionally NOT removed so that any bookmarked or direct-linked URLs
 * still land gracefully instead of a 404.
 */
export default function HostDealerNetwork() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <div className="max-w-md w-full rounded-2xl border border-border/50 bg-card/60 p-8 text-center space-y-5">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <ArrowRightLeft className="h-7 w-7 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Dealer Network Has Moved</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The legacy Dealer Network workspace has been replaced by <strong className="text-foreground">Dealer360</strong> — 
            the full vehicle acquisition and liquidation platform with real Stripe buying power holds, 
            auction concierge, AI valuation, and public listings.
          </p>
        </div>
        <Button asChild className="gradient-primary w-full">
          <Link to="/host/dealer360">
            Go to Dealer360 <ArrowRight className="h-4 w-4 ml-1.5" />
          </Link>
        </Button>
        <p className="text-xs text-muted-foreground">
          Historical records from the old Dealer Network are still accessible to admins if needed.
        </p>
      </div>
    </div>
  );
}