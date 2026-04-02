import React from "react";
import { Link } from "react-router-dom";
import { User } from "lucide-react";
import NotificationsPanel from "./NotificationsPanel";

const LOGO = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function HomeTopBar({ user, city, onCityChange }) {
  return (
    <header className="sticky top-0 z-40 bg-[#0d0718] px-4 h-14 flex items-center justify-between">
      {/* Logo + wordmark */}
      <div className="flex items-center gap-2">
        <img src={LOGO} alt="uRide" className="h-8 w-8 rounded-xl object-cover" />
        <span className="font-bold text-white text-lg tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>
          uRide
        </span>
      </div>

      {/* Right icons */}
      <div className="flex items-center gap-1 relative">
        <NotificationsPanel user={user} />

        <Link to="/account">
          {user ? (
            <div
              className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold text-white ml-1"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}
            >
              {user.full_name?.charAt(0) || "U"}
            </div>
          ) : (
            <div className="h-9 w-9 rounded-full flex items-center justify-center bg-white/10 ml-1">
              <User className="h-4.5 w-4.5 text-white/70" />
            </div>
          )}
        </Link>
      </div>
    </header>
  );
}