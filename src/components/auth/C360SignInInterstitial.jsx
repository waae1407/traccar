import React from 'react';
import { base44 } from '@/api/base44Client';
import { X, Shield, Zap, MapPin } from 'lucide-react';

const LOGO = "https://media.base44.com/images/public/69cdfc01c15011a821c6ee7e/e1b09d5a7_CAFD8E89-66B0-4EA4-A904-6E4573A3C570.png";

export default function C360SignInInterstitial({ onClose }) {
  const handleSignIn = () => {
    base44.auth.redirectToLogin(window.location.href);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(2, 6, 23, 0.88)', backdropFilter: 'blur(8px)' }}>
      <div className="relative w-full max-w-md rounded-3xl bg-card border border-border p-8 text-center space-y-6 animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-center pt-2">
          <img src={LOGO} alt="Contactless360" className="h-12 object-contain" />
        </div>

        <div>
          <h2 className="text-2xl font-syne font-bold text-white">Sign in to Contactless360</h2>
          <p className="text-sm text-muted-foreground mt-2">Access your GPS devices, manage your subscription, and control your vehicle.</p>
        </div>

        <div className="space-y-2.5 text-left">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <MapPin className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">Track your vehicle's location in real-time</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <Shield className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">Geofence alerts and anti-theft protection</p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <Zap className="w-5 h-5 text-yellow-400 flex-shrink-0" />
            <p className="text-xs text-muted-foreground">Remote lock, unlock, and starter controls</p>
          </div>
        </div>

        <button
          onClick={handleSignIn}
          className="w-full h-14 rounded-2xl font-bold text-white text-base transition-transform hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))' }}
        >
          Sign In / Create Account
        </button>

        <p className="text-xs text-muted-foreground/60 leading-relaxed">
          You'll continue to our secure login. Your Contactless360 account works across all uRideHub services.
        </p>
      </div>
    </div>
  );
}