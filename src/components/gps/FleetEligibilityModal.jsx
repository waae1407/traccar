import React from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowRight, ShieldAlert, Clock, Car, Zap, LogIn } from 'lucide-react';

/**
 * Modal that shows the result of the fleet eligibility check.
 * reason: NOT_LOGGED_IN | NOT_HOST | HOST_NOT_APPROVED | NO_ACTIVE_VEHICLE |
 *         NO_ACTIVE_TELEMATICS_DEVICE | ELIGIBLE
 */
export default function FleetEligibilityModal({ open, onClose, reason, eligibilityData = {} }) {
  if (!open) return null;

  const configs = {
    NOT_LOGGED_IN: {
      icon: LogIn,
      iconColor: "text-yellow-400",
      iconBg: "bg-yellow-500/20",
      title: "Log In as Fleet Partner",
      message: "The Fleet Partner Expansion Kit is for approved uRide hosts who already completed their first Contactless360 setup. Please log in to check your eligibility.",
      actions: [
        { label: "Log In as Fleet Partner", href: "/account", primary: true },
        { label: "Buy First Device Setup", href: "/gps/checkout?pkg=device_subscription", primary: false },
      ],
    },
    NOT_HOST: {
      icon: ShieldAlert,
      iconColor: "text-orange-400",
      iconBg: "bg-orange-500/20",
      title: "Fleet Partner Kit Not Available",
      message: "This discounted expansion kit is only for approved uRide Fleet Partners. If this is your first Contactless360 device, choose First Device Setup.",
      actions: [
        { label: "Buy First Device Setup", href: "/gps/checkout?pkg=device_subscription", primary: true },
        { label: "Become a Fleet Partner", href: "/become-a-host", primary: false },
      ],
    },
    HOST_NOT_APPROVED: {
      icon: Clock,
      iconColor: "text-blue-400",
      iconBg: "bg-blue-500/20",
      title: "Host Approval Required",
      message: "Your host account is still pending approval. Fleet Partner Expansion pricing becomes available after your host account is approved and your first Contactless360 device is active.",
      actions: [
        { label: "View Host Status", href: "/host/dashboard", primary: true },
        { label: "Buy First Device Setup", href: "/gps/checkout?pkg=device_subscription", primary: false },
      ],
    },
    NO_ACTIVE_VEHICLE: {
      icon: Car,
      iconColor: "text-red-400",
      iconBg: "bg-red-500/20",
      title: "Active Vehicle Required",
      message: "The Fleet Partner Expansion Kit is for expanding an active fleet. Please add and activate your first vehicle before using this discount.",
      actions: [
        { label: "Add Vehicle", href: "/host/vehicles", primary: true },
        { label: "Buy First Device Setup", href: "/gps/checkout?pkg=device_subscription", primary: false },
      ],
    },
    NO_ACTIVE_TELEMATICS_DEVICE: {
      icon: Zap,
      iconColor: "text-purple-400",
      iconBg: "bg-purple-500/20",
      title: "First Device Setup Required",
      message: "This looks like your first telematics installation. The Fleet Partner Expansion Kit is only available after your first Contactless360 device is active. Please choose Contactless360 Device + Subscription to start.",
      actions: [
        { label: "Buy First Device Setup", href: "/gps/checkout?pkg=device_subscription", primary: true },
        { label: "Activate Existing Device", href: "/gps/activate", primary: false },
      ],
    },
    ELIGIBLE: {
      icon: CheckCircle,
      iconColor: "text-green-400",
      iconBg: "bg-green-500/20",
      title: "Fleet Partner Price Unlocked",
      message: "You qualify for Fleet Partner Expansion pricing because your host account is approved and you already have an active vehicle with an active Contactless360 device.",
      priceDisplay: { price: 130, msrp: 179, savings: 49 },
      actions: [
        { label: "Continue to Fleet Kit Checkout", href: "/gps/checkout?pkg=host_contactless_kit", primary: true },
      ],
    },
  };

  const cfg = configs[reason] || configs.NOT_LOGGED_IN;
  const Icon = cfg.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}>
              <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
            </div>
            <DialogTitle className="text-lg font-syne font-bold text-white leading-tight">
              {cfg.title}
            </DialogTitle>
          </div>
        </DialogHeader>

        <p className="text-sm text-muted-foreground leading-relaxed">{cfg.message}</p>

        {cfg.priceDisplay && (
          <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-4 space-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-black text-white">${cfg.priceDisplay.price}</span>
              <span className="text-lg text-muted-foreground line-through">${cfg.priceDisplay.msrp}</span>
            </div>
            <p className="text-sm text-green-400 font-semibold">Save ${cfg.priceDisplay.savings} — Fleet Partner Launch Discount</p>
            <p className="text-xs text-muted-foreground">+ $14.99/mo subscription</p>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {cfg.actions.map((action) => (
            <Link key={action.label} to={action.href} onClick={onClose}>
              <Button
                className={`w-full ${action.primary ? 'gradient-primary glow-sm' : ''}`}
                variant={action.primary ? 'default' : 'outline'}
              >
                {action.label} {action.primary && <ArrowRight className="w-4 h-4" />}
              </Button>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}