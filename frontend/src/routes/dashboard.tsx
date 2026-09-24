import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useRequireAuth } from "../hooks/useRequireAuth";
import api from "../api/axios";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Developer Dashboard" }] }),
  component: DashboardPage,
});

type Room = {
  roomId: string;
  name: string;
  language: string;
  owner: { _id: string; username: string };
  members: { _id: string; username: string }[];
  isPrivate: boolean;
};

type Stats = {
  totalRooms: number;
  ownedRooms: number;
  collaboratingRooms: number;
  pendingInvitations: number;
  savedSessions: number;
  totalSystemRooms: number;
  totalUsers: number;
  activeRooms: number;
  activeUsers: number;
};

function DashboardPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useRequireAuth();
  const [joinId, setJoinId] = useState("");
  const [search, setSearch] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [roomsRes, statsRes] = await Promise.all([
        api.get('/api/rooms'),
        api.get('/api/rooms/stats/system')
      ]);
      setRooms(roomsRes.data);
      setStats(statsRes.data);
    } catch (error) {
      console.error("Failed to load dashboard data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const handleDelete = async (room: Room) => {
    const isOwner = user && room.owner?._id === user._id;
    const confirmMsg = isOwner
      ? `Permanently delete "${room.name}" for ALL collaborators? This cannot be undone.`
      : `Leave "${room.name}"? You will lose access to this room.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await api.delete(`/api/rooms/${room.roomId}`);
      setRooms(prev => prev.filter(r => r.roomId !== room.roomId));
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to delete/leave room");
    }
  };

  const enterRoom = async () => {
    const id = joinId.trim();
    if (!id) return;

    try {
      const res = await api.post('/api/rooms/join', { roomId: id });
      const roomData = res.data;

      localStorage.setItem("syncscript_active_roomId", roomData.roomId);
      navigate({ to: "/room/$roomId", params: { roomId: roomData.roomId } });
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to join room");
    }
  };

  const filteredRooms = rooms.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.language.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppShell>
      <main className="flex flex-col min-h-screen">
        <div className="p-8 space-y-8">
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 relative group overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-background to-background border border-primary/20 p-8 flex flex-col justify-between min-h-[220px] transition-all hover:border-primary/40">
              <div className="absolute -right-12 -top-12 w-64 h-64 bg-[#3B82F6]/5 blur-[80px] rounded-full pointer-events-none"></div>
              <div className="relative z-10">
                <h1 className="text-4xl lg:text-5xl font-bold text-[#e1e2eb] tracking-tight leading-tight">Start a fresh<br />collaborative session.</h1>
                <p className="text-[#8c909f] mt-2 max-w-md">Instantly spin up a secure, real-time environment with syntax highlighting, shared terminal, and git integration.</p>
              </div>
              <div className="relative z-10 flex items-center gap-4 mt-6">
                <Link to="/rooms/new" className="flex items-center gap-2 bg-[#3B82F6] text-white px-6 py-3 rounded-lg font-bold hover:bg-[#2563eb] transition-all active:scale-95 shadow-xl shadow-[#3B82F6]/30">
                  <span className="material-symbols-outlined text-[20px]">add_box</span>
                  Create New Room
                </Link>
              </div>
            </div>

            <div className="bg-[#1d2026]/70 rounded-xl p-8 flex flex-col border border-white/5">
              <div className="mb-4">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-[#3B82F6] mb-4">
                  <span className="material-symbols-outlined">key</span>
                </div>
                <h2 className="text-xl font-semibold">Join Room</h2>
                <p className="text-sm text-[#8c909f] mt-1">Enter a unique invitation code or URL to jump into an existing project.</p>
              </div>
              <div className="mt-auto space-y-3">
                <div className="relative">
                  <input
                    className="w-full bg-[#0B0E14] border border-white/10 rounded-lg py-2.5 px-4 text-sm font-mono focus:ring-1 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none transition-all"
                    placeholder="Invite code (e.g. ss-49x-z2)"
                    value={joinId}
                    onChange={e => setJoinId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && enterRoom()}
                    type="text"
                  />
                </div>
                <button onClick={enterRoom} className="w-full flex items-center justify-center gap-2 bg-[#3B82F6] text-white px-6 py-3 rounded-lg font-bold hover:bg-[#2563eb] transition-all active:scale-95 shadow-xl shadow-[#3B82F6]/30">
                  <span className="material-symbols-outlined text-[20px]">login</span>
                  Join Room
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-bold tracking-tight">Active Rooms</h3>
                <span className="bg-[#25C2A0]/10 text-[#25C2A0] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-[#25C2A0] rounded-full animate-pulse"></span>
                  LIVE
                </span>
              </div>
            </div>

            <div className="mb-4 flex gap-2">
              <input
                placeholder="Search rooms by name or language..."
                className="flex-1 bg-[#0B0E14] border border-white/10 rounded-lg py-2 px-4 text-sm focus:ring-1 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none transition-all"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRooms.map(room => {
                const isOwner = user && room.owner?._id === user._id;
                return (
                <div key={room.roomId} className="group relative block rounded-xl p-5 border border-white/5 bg-[#1d2026]/70 backdrop-blur hover:border-[#3B82F6]/30 transition-all duration-300">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <Link to="/room/$roomId" params={{ roomId: room.roomId }} className="flex flex-col min-w-0 flex-1 group/title">
                      <span className="text-base font-bold text-[#e1e2eb] group-hover/title:text-[#adc6ff] truncate transition-colors">{room.name}</span>
                      <span className="text-xs text-[#3B82F6] font-mono">{room.language}</span>
                    </Link>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-1 text-[#8c909f] bg-white/5 px-2 py-1 rounded">
                        <span className="material-symbols-outlined text-[14px]">group</span>
                        <span className="text-[11px] font-bold">{room.members?.length ?? 0}</span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(room); }}
                        className="p-1 rounded-lg text-[#8c909f] hover:text-rose-400 hover:bg-rose-500/20 transition-all flex items-center justify-center"
                        title={isOwner ? "Delete room" : "Leave room"}
                        aria-label={isOwner ? "Delete room" : "Leave room"}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isOwner ? "delete" : "logout"}
                        </span>
                      </button>
                    </div>
                  </div>

                  <Link to="/room/$roomId" params={{ roomId: room.roomId }} className="block">
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1.5">
                          {room.members.slice(0, 3).map((m, i) => (
                            <div key={m._id || i} className="w-6 h-6 rounded-full border border-[#10131a] bg-slate-500 overflow-hidden flex items-center justify-center text-[10px] font-bold text-white" title={m.username}>
                              {m.username.charAt(0).toUpperCase()}
                            </div>
                          ))}
                          {room.members.length > 3 && (
                            <div className="w-6 h-6 rounded-full border border-[#10131a] bg-white/10 flex items-center justify-center text-[8px] font-bold">
                              +{room.members.length - 3}
                            </div>
                          )}
                        </div>
                        {isOwner && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded">Owner</span>
                        )}
                      </div>
                      <span className="bg-[#3B82F6]/10 group-hover:bg-[#3B82F6] text-[#3B82F6] group-hover:text-white px-4 py-1.5 rounded font-bold text-sm transition-all">Enter</span>
                    </div>
                  </Link>
                </div>
              );})
              }
              {filteredRooms.length === 0 && (
                <div className="col-span-full py-10 text-center text-[#8c909f]">No rooms found.</div>
              )}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-[#1d2026]/70 rounded-xl overflow-hidden border border-white/5 transition-all hover:border-[#3B82F6]/30">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#3B82F6] text-[20px]">monitor_heart</span>
                  <h4 className="font-bold text-[#e1e2eb]">System Health & Preferences</h4>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/profile"
                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-[#3B82F6]/10 text-[#adc6ff] hover:bg-[#3B82F6] hover:text-white transition-all flex items-center gap-1 border border-[#3B82F6]/20"
                    title="View & Edit Profile"
                  >
                    <span className="material-symbols-outlined text-[14px]">account_circle</span>
                    <span>Profile</span>
                  </Link>
                  <Link
                    to="/settings"
                    className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white/5 text-[#c2c6d6] hover:bg-white/10 hover:text-white transition-all flex items-center gap-1 border border-white/10"
                    title="System Settings"
                  >
                    <span className="material-symbols-outlined text-[14px]">settings</span>
                    <span>Settings</span>
                  </Link>
                </div>
              </div>
              <div className="p-6 h-40 flex items-end justify-around gap-1 px-8">
                <Link to="/rooms" className="flex flex-col items-center justify-end h-full group/stat cursor-pointer hover:scale-105 transition-transform" title="View My Rooms">
                  <div className="text-3xl font-bold text-[#3B82F6] mb-2 group-hover/stat:text-[#adc6ff] transition-colors">{stats ? stats.totalRooms : rooms.length}</div>
                  <div className="text-xs text-[#8c909f] uppercase tracking-wider font-bold group-hover/stat:text-[#adc6ff] transition-colors flex items-center gap-1">
                    My Rooms
                    <span className="material-symbols-outlined text-[12px] opacity-0 group-hover/stat:opacity-100 transition-opacity">arrow_forward</span>
                  </div>
                </Link>
                <Link to="/rooms" className="flex flex-col items-center justify-end h-full group/stat cursor-pointer hover:scale-105 transition-transform" title="View Owned Rooms">
                  <div className="text-3xl font-bold text-[#25C2A0] mb-2 group-hover/stat:brightness-125 transition-all">{stats ? stats.ownedRooms : '-'}</div>
                  <div className="text-xs text-[#8c909f] uppercase tracking-wider font-bold group-hover/stat:text-[#25C2A0] transition-colors flex items-center gap-1">
                    Owned
                    <span className="material-symbols-outlined text-[12px] opacity-0 group-hover/stat:opacity-100 transition-opacity">arrow_forward</span>
                  </div>
                </Link>
                <Link to="/rooms" className="flex flex-col items-center justify-end h-full group/stat cursor-pointer hover:scale-105 transition-transform" title="View Collaborating Rooms">
                  <div className="text-3xl font-bold text-[#adc6ff] mb-2 group-hover/stat:brightness-125 transition-all">{stats ? stats.collaboratingRooms : '-'}</div>
                  <div className="text-xs text-[#8c909f] uppercase tracking-wider font-bold group-hover/stat:text-[#adc6ff] transition-colors flex items-center gap-1">
                    Collaborating
                    <span className="material-symbols-outlined text-[12px] opacity-0 group-hover/stat:opacity-100 transition-opacity">arrow_forward</span>
                  </div>
                </Link>
                <Link to="/profile" className="flex flex-col items-center justify-end h-full group/stat cursor-pointer hover:scale-105 transition-transform" title="View Profile">
                  <div className="text-3xl font-bold text-[#25C2A0] mb-2 group-hover/stat:brightness-125 transition-all">{stats ? stats.totalUsers : '-'}</div>
                  <div className="text-xs text-[#8c909f] uppercase tracking-wider font-bold group-hover/stat:text-[#25C2A0] transition-colors flex items-center gap-1">
                    Total Users
                    <span className="material-symbols-outlined text-[12px] opacity-0 group-hover/stat:opacity-100 transition-opacity">arrow_forward</span>
                  </div>
                </Link>
              </div>
            </div>

            <div className="bg-[#1d2026]/70 rounded-xl p-6 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-[#e1e2eb]">Quick Stats</h4>
                <Link to="/settings" className="text-xs text-[#8c909f] hover:text-[#3B82F6] flex items-center gap-1 font-semibold transition-colors">
                  <span>Preferences</span>
                  <span className="material-symbols-outlined text-[14px]">tune</span>
                </Link>
              </div>
              <div className="space-y-4">
                <Link to="/rooms" className="flex justify-between items-center group cursor-pointer hover:bg-white/5 p-1 rounded-md transition-colors">
                  <span className="text-sm text-[#8c909f] group-hover:text-white transition-colors">Owned Rooms</span>
                  <span className="font-mono font-bold text-[#3B82F6]">{stats?.ownedRooms ?? 0}</span>
                </Link>
                <Link to="/rooms" className="flex justify-between items-center group cursor-pointer hover:bg-white/5 p-1 rounded-md transition-colors">
                  <span className="text-sm text-[#8c909f] group-hover:text-white transition-colors">Joined Collaborations</span>
                  <span className="font-mono font-bold text-[#25C2A0]">{stats?.collaboratingRooms ?? 0}</span>
                </Link>
                <Link to="/invite" className="flex justify-between items-center group cursor-pointer hover:bg-white/5 p-1 rounded-md transition-colors">
                  <span className="text-sm text-[#8c909f] group-hover:text-white transition-colors">Pending Invitations</span>
                  <span className="font-mono font-bold text-[#adc6ff]">{stats?.pendingInvitations ?? 0}</span>
                </Link>
                <Link to="/history" className="flex justify-between items-center group cursor-pointer hover:bg-white/5 p-1 rounded-md transition-colors">
                  <span className="text-sm text-[#8c909f] group-hover:text-white transition-colors">Saved Snapshots</span>
                  <span className="font-mono font-bold text-amber-400">{stats?.savedSessions ?? 0}</span>
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
