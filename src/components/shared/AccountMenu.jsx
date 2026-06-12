import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { LogOut, User, Settings, ChevronDown, Satellite } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { cn } from "@/lib/utils";

const ROLE_LABELS = {
  admin: "Admin",
  host: "Host Operator",
  user: "Member",
};

const ROLE_COLORS = {
  admin: "text-yellow-400 bg-yellow-400/10",
  host: "text-primary bg-primary/10",
  user: "text-blue-400 bg-blue-400/10",
};

/**
 * AccountMenu — reusable dropdown for Admin/Host portals (dark theme).
 * Props:
 *   role: "admin" | "host" | "user"
 *   accountPath: where "My Account" navigates (default: role-based)
 *   extraItems: [{label, icon, onClick, path}] — prepended before logout
 *   compact: boolean — show icon only (no name)
 *   theme: "dark" (default) | "light"
 */
export default function AccountMenu({ role = "user", accountPath, extraItems = [], compact = false, theme = "dark" }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const isDark = theme === "dark";

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const resolvedAccountPath = accountPath || (role === "admin" ? "/dashboard" : role === "host" ? "/host/dashboard" : "/account");
  const displayName = user?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.charAt(0).toUpperCase();
  const roleLabel = ROLE_LABELS[role] || "User";
  const roleColor = ROLE_COLORS[role] || ROLE_COLORS.user;

  const handleLogout = () => {
    setOpen(false);
    if (typeof logout === "function") {
      logout(true);
    } else {
      import("@/api/base44Client").then(({ base44 }) => base44.auth.logout("/"));
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 rounded-xl transition-all",
          isDark
            ? "h-9 px-2 hover:bg-white/[0.08] border border-transparent hover:border-white/[0.1]"
            : "h-9 px-2 hover:bg-gray-100 border border-transparent hover:border-gray-200"
        )}
        aria-label="Account menu"
      >
        {/* Avatar */}
        <div className="h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
          style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
          {initials}
        </div>
        {!compact && (
          <>
            <span className={cn("text-sm font-medium max-w-[110px] truncate hidden sm:block", isDark ? "text-white/80" : "text-gray-700")}>
              {displayName}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 flex-shrink-0 hidden sm:block transition-transform", open && "rotate-180", isDark ? "text-white/40" : "text-gray-400")} />
          </>
        )}
      </button>

      {open && (
        <div className={cn(
          "absolute right-0 top-full mt-2 w-60 rounded-2xl shadow-2xl z-50 overflow-hidden border",
          isDark
            ? "bg-[hsl(222,28%,10%)] border-white/[0.08]"
            : "bg-white border-gray-200"
        )}>
          {/* User info header */}
          <div className={cn("px-4 py-3 border-b", isDark ? "border-white/[0.06]" : "border-gray-100")}>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: "linear-gradient(135deg, hsl(338 90% 56%), hsl(265 80% 62%))" }}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className={cn("text-sm font-semibold truncate", isDark ? "text-white" : "text-gray-900")}>{displayName}</p>
                <p className={cn("text-xs truncate", isDark ? "text-white/40" : "text-gray-400")}>{user?.email}</p>
              </div>
            </div>
            <span className={cn("inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider", roleColor)}>
              {roleLabel}
            </span>
          </div>

          {/* Menu items */}
          <div className="py-1.5">
            <MenuItem isDark={isDark} icon={User} label="My Account" to={resolvedAccountPath} onClose={() => setOpen(false)} />
            <MenuItem isDark={isDark} icon={Settings} label="Settings" to={resolvedAccountPath} onClose={() => setOpen(false)} />

            {extraItems.map((item) => (
              <MenuItem
                key={item.label}
                isDark={isDark}
                icon={item.icon || User}
                label={item.label}
                to={item.path}
                onClick={item.onClick}
                onClose={() => setOpen(false)}
              />
            ))}
          </div>

          {/* Logout */}
          <div className={cn("border-t py-1.5", isDark ? "border-white/[0.06]" : "border-gray-100")}>
            <button
              onClick={handleLogout}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                isDark
                  ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  : "text-red-500 hover:bg-red-50"
              )}
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({ isDark, icon: IconComp, label, to, onClick, onClose }) {
  const Icon = IconComp;
  const cls = cn(
    "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left",
    isDark ? "text-white/70 hover:text-white hover:bg-white/[0.06]" : "text-gray-700 hover:bg-gray-50"
  );

  if (to) {
    return (
      <Link to={to} onClick={onClose} className={cls}>
        <Icon className="h-4 w-4 flex-shrink-0 opacity-60" />
        {label}
      </Link>
    );
  }
  return (
    <button onClick={() => { onClick?.(); onClose(); }} className={cls}>
      <Icon className="h-4 w-4 flex-shrink-0 opacity-60" />
      {label}
    </button>
  );
}