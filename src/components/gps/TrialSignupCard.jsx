import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, CheckCircle, ArrowRight, Clock, CreditCard, Package } from 'lucide-react';

const PRODUCT_IMG = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/4f05d3221_29FB89C9-50E3-48A5-A76D-C33D086036D1.png";

export default function TrialSignupCard() {
  const trialFeatures = [
    "Full GPS tracking & alerts",
    "Remote lock/unlock & immobilizer",
    "Geofence & movement alerts",
    "24/7 monitoring dashboard",
    "Smart battery & smoke alerts",
    "Trip history & speed alerts",
  ];

  return (
    <div className="rounded-2xl border-2 border-yellow-500/60 bg-gradient-to-br from-yellow-500/10 via-yellow-600/5 to-background p-8 flex flex-col gap-5 relative overflow-hidden">
      {/* Glow accent */}
      <div className="absolute -top-12 -right-12 w-40 h-40 bg-yellow-500/20 rounded-full blur-3xl pointer-events-none" />

      <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-black text-xs px-5 py-1 z-10">
        <Sparkles className="w-3 h-3 mr-1" /> 90-DAY FREE TRIAL
      </Badge>

      <div className="space-y-2 pt-2">
        <h3 className="text-xl font-syne font-bold text-white">Free 3-Month Trial</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Get a Contactless360 GPS device with full features — free for 90 days. No charge during trial.
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-black text-white">$0</span>
          <span className="text-sm text-muted-foreground">for 90 days</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Then</span>
          <span className="text-white font-bold">$14.99/mo</span>
          <span className="text-muted-foreground">auto-starts</span>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground bg-card/40 rounded-lg p-3 border border-border/50">
        <Package className="w-4 h-4 text-yellow-400 flex-shrink-0" />
        <span>Free shipping — device arrives in 1-2 business days</span>
      </div>

      <ul className="space-y-2 flex-1">
        {trialFeatures.map(f => (
          <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      <div className="space-y-3 border-t border-border/50 pt-4">
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5 mt-0.5 text-yellow-400 flex-shrink-0" />
          <span>Cancel anytime. If you cancel, return the device within 14 days (prepaid label provided) or a $100 device fee applies.</span>
        </div>
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <CreditCard className="w-3.5 h-3.5 mt-0.5 text-yellow-400 flex-shrink-0" />
          <span>Card required at signup to activate your subscription after the trial. No charge for 90 days.</span>
        </div>
      </div>

      <Link to="/gps/trial">
        <Button size="lg" className="w-full gradient-primary glow-sm font-bold text-base">
          <Sparkles className="w-4 h-4" /> Start Free Trial <ArrowRight className="w-4 h-4" />
        </Button>
      </Link>
    </div>
  );
}