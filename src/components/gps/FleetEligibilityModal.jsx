import React from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Shield, CheckCircle, AlertCircle, Clock, Car, Zap, Tag } from 'lucide-react';

// reason codes => config
const CONFIGS = {
  NOT_LOGGED_IN: {
    icon: Shield,
    iconColor: 'text-yellow-400',
    iconBg: 'bg-yellow-500/20',
    title: 'Log In as Fleet Partner',
    message: 'The Fleet Partner Expansion Kit is for approved uRide hosts who already completed their first Contactless360 setup. Please log in to check your eligibility.',
    actions: [
      { label: 'Log In as Fleet Partner', href: '/account?return=/gps', primary: true },
      { label: 'Buy First Device Setup', href: '/gps/checkout?pkg=device_subscription', primary: false },
    ],
  },
  NOT_HOST: {
    icon: AlertCircle,
    iconColor: 'text-red-400',
    iconBg: 'bg-red-500/20',
    title: 'Fleet Partner Kit Not Available',
    message: 'This discounted expansion kit is only for approved uRide Fleet Partners. If this is your first Contactless360 device, choose First Device Setup.',
    actions: [
      { label: 'Buy First Device Setup', href: '/gps/checkout?pkg=device_subscription', primary: true },
      { label: 'Become a Fleet Partner', href: '/become-a-host', primary: false },
    ],
  },
  HOST_NOT_APPROVED: {
    icon: Clock,
    iconColor: 'text-yellow-400',
    iconBg: 'bg-yellow-500/20',
    title: 'Host Approval Required',
    message: 'Your host account is still pending approval. Fleet Partner Expansion pricing becomes available after your host account is approved and your first Contactless360 device is active.',
    actions: [
      { label: 'View Host Status', href: '/host/dashboard', primary: true },
      { label: 'Buy First Device Setup', href: '/gps/checkout?pkg=device_subscription', primary: false },
    ],
  },
  NO_ACTIVE_VEHICLE: {
    icon: Car,
    iconColor: 'text-orange-400',
    iconBg: 'bg-orange-500/20',
    title: 'Active Vehicle Required',
    message: 'The Fleet Partner Expansion Kit is for expanding an active fleet. Please add and activate your first vehicle before using this discount.',
    actions: [
      { label: 'Add Vehicle', href: '/host/vehicles', primary: true },
      { label: 'Buy First Device Setup', href: '/gps/checkout?pkg=device_subscription', primary: false },
    ],
  },
  NO_ACTIVE_TELEMATICS_DEVICE: {
    icon: Zap,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/20',
    title: 'First Device Setup Required',
    message: 'This looks like your first telematics installation. The Fleet Partner Expansion Kit is only available after your first Contactless360 device is active. Please choose Contactless360 Device + Subscription to start.',
    actions: [
      { label: 'Buy First Device Setup', href: '/gps/checkout?pkg=device_subscription', primary: true },
      { label: 'Activate Existing Device', href: '/gps/activate', primary: false },
    ],
  },
  ELIGIBLE: {
    icon: CheckCircle,
    iconColor: 'text-green-400',
    iconBg: 'bg-green-500/20',
    title: 'Fleet Partner Price Unlocked',
    message: 'You qualify for Fleet Partner Expansion pricing because your host account is approved and you already have an active vehicle with an active Contactless360 device.',
    actions: [
      { label: 'Continue to Fleet Kit Checkout', href: '/gps/checkout?pkg=host_contactless_kit', primary: true },
    ],
    showPricing: true,
  },
};

export default function FleetEligibilityModal({ open, onClose, reason, eligibilityData }) {
  const config = CONFIGS[reason] || CONFIGS.NOT_LOGGED_IN;
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.iconBg}`}>
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <DialogTitle className="text-white">{config.title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{config.message}</p>

          {config.showPricing && (
            <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 space-y-2">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-white">$130</span>
                <span className="text-lg text-muted-foreground line-through">$179</span>
              </div>
              <div className="flex items-center gap-2 text-green-400 text-sm font-semibold">
                <Tag className="w-3.5 h-3.5" /> Save $49 — Fleet Partner Launch Discount
              </div>
              <p className="text-xs text-muted-foreground">+ $14.99/month</p>
              {eligibilityData && (
                <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-yellow-500/20">
                  <p>✓ {eligibilityData.active_vehicle_count} active vehicle(s)</p>
                  <p>✓ {eligibilityData.active_telematics_count} active telematics device(s)</p>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            {config.actions.map((action) => (
              <Link key={action.label} to={action.href} onClick={onClose}>
                <Button className="w-full" variant={action.primary ? 'default' : 'outline'}
                  style={action.primary ? { background: 'linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))' } : {}}>
                  {action.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}