import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

type Item = { to: string; icon: string; label: string; match?: (p: string) => boolean };
const ITEMS: Item[] = [
  { to: "/dashboard", icon: "dashboard", label: "Dashboard" },
  { to: "/rooms", icon: "meeting_room", label: "My Rooms", match: (p) => (p === "/rooms" || p.startsWith("/room/")) && p !== "/rooms/new" },
  { to: "/rooms/new", icon: "add_box", label: "New Room", match: (p) => p === "/rooms/new" },
  { to: "/history", icon: "history", label: "Recent Sessions" },
  { to: "/profile", icon: "person", label: "Profile", match: (p) => p === "/profile" },
  { to: "/settings", icon: "settings", label: "Settings", match: (p) => p === "/settings" },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  
  const initial = user?.username ? user.username.charAt(0).toUpperCase() : "U";
  const displayName = user?.username || "Guest";

  return (
    <aside className="fixed left-0 top-0 bottom-0 flex flex-col w-[260px] bg-[#0F1219] border-r border-white/5 z-40">
      <div className="h-[48px] flex items-center px-6 gap-3 border-b border-white/5">
        <div className="w-8 h-8 rounded-lg bg-[#adc6ff] flex items-center justify-center">
          <span className="material-symbols-outlined text-[20px]" style={{ color: "#002e6a" }}>terminal</span>
        </div>
        <span className="text-[18px] font-bold text-[#adc6ff] tracking-tight">SYNCSCRIPT</span>
      </div>
      <nav className="flex-1 mt-6 px-3 space-y-1 text-sm overflow-y-auto">
        <div className="px-3 mb-2 text-[10px] tracking-wider uppercase text-[#8c909f] font-mono">Overview</div>
        {ITEMS.map((it, i) => {
          const active = it.match ? it.match(path) : path === it.to;
          return (
            <Link
              key={i}
              to={it.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md transition-all ${
                active
                  ? "text-[#adc6ff] bg-[#adc6ff]/10 border-l-2 border-[#adc6ff] rounded-r-md"
                  : "text-[#c2c6d6] hover:bg-white/5 hover:text-[#adc6ff]"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">{it.icon}</span>
              <span>{it.label}</span>
            </Link>
          );
        })}
        <div className="px-3 pt-6 mb-2 text-[10px] tracking-wider uppercase text-[#8c909f] font-mono">Collaborate</div>
        <Link
          to="/invite"
          className={`flex items-center justify-between px-3 py-2 rounded-md transition-all ${
            path === "/invite" ? "text-[#adc6ff] bg-[#adc6ff]/10 border-l-2 border-[#adc6ff] rounded-r-md" : "text-[#c2c6d6] hover:bg-white/5 hover:text-[#adc6ff]"
          }`}
        >
          <span className="flex items-center gap-3"><span className="material-symbols-outlined text-[20px]">person_add</span>Invite</span>
          <span className="bg-[#adc6ff]/20 text-[#adc6ff] text-[10px] px-1.5 py-0.5 rounded font-bold uppercase">Pro</span>
        </Link>
      </nav>
      <Link to="/profile" className="p-3 border-t border-white/5 flex items-center gap-3 hover:bg-white/5 transition-colors">
        {user?.avatar ? (
          <img src={user.avatar} alt={displayName} className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-[#adc6ff]/20 flex items-center justify-center text-[#adc6ff] font-bold shrink-0">{initial}</div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="text-[#e1e2eb] font-semibold text-[12px] truncate">{displayName}</span>
          <span className="text-[#8c909f] text-[11px] font-mono">Pro Plan</span>
        </div>
      </Link>
    </aside>
  );
}

export function AppShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-screen bg-[#10131a] text-[#e1e2eb]">
      <AppSidebar />
      <div className={`ml-[260px] min-h-screen ${className}`}>{children}</div>
    </div>
  );
}
