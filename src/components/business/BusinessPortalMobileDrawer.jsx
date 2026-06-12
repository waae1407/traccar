import React from "react";
import { Link, useLocation } from "react-router-dom";
import { X, LogOut, User } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { getBusinessPortalMenu } from "@/components/business/roleBasedMenuConfig";
import { useTenant } from "@/lib/useTenant";
import { cn } from "@/lib/utils";

const LOGO_ICON = "https://media.base44.com/images/public/user_68d033161412d5b125c58fda/e0b7fe7d9_94087D67-9034-4A3E-BA7B-C9592E9A9CC8.jpeg";

export default function BusinessPortalMobileDrawer({ open, onClose, role = "admin", showDealerNetwork = true }) {
  const { user, logout } = useAuth();
  const { isSuperadmin } = useTenant();
  const location = useLocation();

  if (!open) return null;

  const { quickLinks, sections } = getBusinessPortalMenu({ role, isSuperadmin, showDealerNetwork });
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const initials = (user?.full_name?.charAt(0) || user?.email?.charAt(0) || "U").toUpperCase();
  const accountPath = role === "host" ? "/host/dashboard" : "/dashboard";

  const isActive = (path) => location.pathname === path || (path !== "/" && location.pathname.startsWith(path + "/"));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 left-0 w-72 z-50 flex flex-col lg:hidden"
        style={{ background: "hsl(222, 30%, 8%)", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Header */}
        <div className="h-[70px] flex items-center justify-between px-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <img src={LOGO_ICON} alt="uRide" className="h-8 w-8 rounded-xl object-cover ring-1 ring-primary/40" />
            <span className="font-bold text-white text-lg" style={{ fontFamily: "var(--font-syne)" }}>uRide</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
          {quickLinks.map((item) => (
            <NavLink key={item.path} item={item} active={isActive(item.path)} onClose={onClose} />
          ))}

          {sections.map((section) => (
            <div key={section.label} className="mt-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 mb-1.5">{section.label}</p>
              {section.items.map((item) => (
                <NavLink key={item.path} item={item} active={isActive(item.path)} onClose={onClose} />
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="border-t border-white/[0.06] px-3 py-4 space-y-3">
          <div className="flex items-center gap-3 px-1">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white/90 truncate">{displayName}</p>
              <p className="text-[11px] text-white/40 truncate">{user?.email}</p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to={accountPath}
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors border border-white/[0.08]"
            >
              <User className="h-3.5 w-3.5" />
              Account
            </Link>
            <button
              onClick={() => { onClose(); logout(true); }}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors border border-white/[0.08]"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function NavLink({ item, active, onClose }) {
  return (
    <Link
      to={item.path}
      onClick={onClose}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
        active
          ? "nav-active"
          : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]"
      )}
    >
      <item.icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-primary" : "text-white/40")} />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}