import React from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function StorefrontFooter({ brand, host }) {
  return (
    <footer className="border-t border-gray-100 bg-white">
      <div className="max-w-5xl mx-auto px-5 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Host branding */}
          <div className="flex items-center gap-3">
            {brand?.logo_url
              ? <img src={brand.logo_url} alt="logo" className="h-10 w-10 rounded-xl object-cover" />
              : <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ background: `linear-gradient(135deg, ${brand?.brand_color || "#e91e8c"}, ${brand?.secondary_color || "#7c3aed"})` }}>
                  {brand?.business_display_name?.charAt(0) || "R"}
                </div>}
            <div>
              <p className="font-bold text-gray-900 text-sm">{brand?.business_display_name}</p>
              <p className="text-xs text-gray-400">{host?.city}{host?.state ? `, ${host.state}` : ""}</p>
            </div>
          </div>

          {/* Trust badge */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-gray-100 bg-gray-50">
            <img src={LOGO_ICON} alt="uRide" className="h-6 w-6 rounded-lg object-cover" />
            <div>
              <p className="text-[10px] font-bold text-gray-700">Powered by uRideHub</p>
              <p className="text-[9px] text-gray-400">Secure booking & payments</p>
            </div>
            <Shield className="h-4 w-4 text-emerald-500 ml-1" />
          </div>

          {/* Links */}
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <Link to="/privacy" className="hover:text-gray-600 transition-colors">Privacy</Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-gray-600 transition-colors">Terms</Link>
            <span>·</span>
            <Link to="/book-now" className="hover:text-gray-600 transition-colors">All Vehicles</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}