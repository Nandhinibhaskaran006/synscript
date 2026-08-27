import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/AppShell";
import api from "../api/axios";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Profile" }] }),
  component: ProfilePage,
});

type Room = {
  roomId: string;
  name: string;
  language: string;
  members: { _id: string; username: string }[];
  isPrivate: boolean;
};

type Stats = {
  roomsCreated: number;
  roomsJoined: number;
  sessionsSaved: number;
  accountCreated: string;
};

function ProfilePage() {
  const navigate = useNavigate();
  const { user, loading, logout, updateProfile, isLoggedIn } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [myRooms, setMyRooms] = useState<Room[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !isLoggedIn) { 
      navigate({ to: "/login" }); 
    }
  }, [loading, isLoggedIn, navigate]);

  useEffect(() => {
    if (user && !isEditing) {
      setEditUsername(user.username);
    }
  }, [user, isEditing]);

  useEffect(() => {
    if (user) {
      const loadData = async () => {
        try {
          const [statsRes, roomsRes] = await Promise.all([
            api.get('/api/auth/me/stats'),
            api.get('/api/rooms')
          ]);
          setStats(statsRes.data);
          // Filter to show rooms CREATED by the current user
          const owned = roomsRes.data.filter((r: any) => r.owner._id === user._id || r.owner === user._id);
          setMyRooms(owned);
        } catch (error) {
          console.error("Failed to load profile data", error);
        } finally {
          setFetching(false);
        }
      };
      loadData();
    }
  }, [user]);

  if (loading || !user || fetching) return <div className="p-10 text-[#e1e2eb]">Loading profile...</div>;

  const handleSave = async () => {
    if (!editUsername) return;
    try {
      await updateProfile(editUsername);
      setIsEditing(false);
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to update username");
    }
  };

  const initial = user.username ? user.username.charAt(0).toUpperCase() : "U";
  
  // Format dates
  const joinedDate = new Date(stats?.accountCreated || Date.now()).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Mock data for static info
  const displayUser = {
    plan: "Pro",
    location: "Global",
    role: "Developer",
    github: "-",
    bio: "Building real-time collaborative tools.",
  };

  const statCards = [
    { label: "Rooms Created", value: stats?.roomsCreated ?? "-" },
    { label: "Rooms Joined", value: stats?.roomsJoined ?? "-" },
    { label: "Sessions Saved", value: stats?.sessionsSaved ?? "-" },
  ];

  return (
    <AppShell>
      <main className="p-10 max-w-5xl mx-auto space-y-10">
        <header className="flex items-center gap-6">
          <div className="w-24 h-24 shrink-0 rounded-full bg-gradient-to-br from-[#3B82F6] to-[#adc6ff] flex items-center justify-center text-4xl font-bold text-[#0B0E14]">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  value={editUsername} 
                  onChange={e => setEditUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  autoFocus
                  className="bg-[#10131a] border border-white/20 rounded px-3 py-1.5 text-2xl font-bold tracking-tight text-white focus:outline-none focus:border-[#3B82F6] focus:ring-1 focus:ring-[#3B82F6] transition-all"
                />
                <button onClick={handleSave} className="bg-[#3B82F6] hover:bg-[#2563eb] text-white px-4 py-1.5 rounded-lg text-sm font-bold transition-colors">Save</button>
                <button onClick={() => { setIsEditing(false); setEditUsername(user.username); }} className="text-[#8c909f] hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors">Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight truncate">{user.username}</h1>
                <button onClick={() => setIsEditing(true)} className="text-[#8c909f] hover:text-white transition-colors flex items-center justify-center w-8 h-8 rounded-md hover:bg-white/5">
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
              </div>
            )}
            <p className="text-[#8c909f] text-sm font-mono mt-1 truncate">{user.email} · {displayUser.role}</p>
            <p className="text-[#c2c6d6] text-sm mt-2 max-w-xl">{displayUser.bio}</p>
          </div>
          <div className="shrink-0 self-start">
            <span className="px-3 py-1 rounded-full bg-[#3B82F6]/15 text-[#adc6ff] text-xs font-bold border border-[#3B82F6]/30 uppercase">{displayUser.plan}</span>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {statCards.map(s => (
            <div key={s.label} className="bg-[#1d2026]/70 border border-white/5 rounded-xl p-6 transition-all hover:border-[#3B82F6]/30">
              <div className="text-3xl font-bold text-[#adc6ff] mb-2">{s.value}</div>
              <div className="text-xs uppercase tracking-wider text-[#8c909f] font-mono">{s.label}</div>
            </div>
          ))}
        </section>

        <section className="bg-[#1d2026]/70 border border-white/5 rounded-xl p-8 space-y-6">
          <h2 className="text-xl font-bold border-b border-white/5 pb-4">Account Information</h2>
          <div className="grid grid-cols-2 gap-x-12 gap-y-6 text-sm">
            {[
              ["Email", user.email],
              ["Username", user.username],
              ["Location", displayUser.location],
              ["GitHub", displayUser.github],
              ["Member since", joinedDate],
              ["Plan", displayUser.plan],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-[10px] uppercase tracking-wider text-[#8c909f] font-mono mb-1">{k}</div>
                <div className="text-[#e1e2eb] font-medium">{v}</div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">Rooms Created</h2>
            <Link to="/rooms/new" className="text-sm font-bold text-[#3B82F6] hover:text-[#adc6ff] transition-colors flex items-center gap-1">
              Create New <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myRooms.map(room => (
              <Link key={room.roomId} to="/room/$roomId" params={{ roomId: room.roomId }} className="group relative block rounded-xl p-5 border border-white/5 bg-[#1d2026]/70 backdrop-blur hover:border-[#3B82F6]/30 transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col">
                    <span className="text-base font-bold text-[#e1e2eb] truncate pr-4">{room.name}</span>
                    <span className="text-xs text-[#3B82F6] font-mono">{room.language}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#8c909f] bg-white/5 px-2 py-1 rounded">
                    <span className="material-symbols-outlined text-[14px]">group</span>
                    <span className="text-[11px] font-bold">{room.members.length}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
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
                  <span className="bg-[#3B82F6]/10 group-hover:bg-[#3B82F6] text-[#3B82F6] group-hover:text-white px-4 py-1.5 rounded font-bold text-sm transition-all">Enter</span>
                </div>
              </Link>
            ))}
            {myRooms.length === 0 && (
              <div className="col-span-full py-12 text-center border border-white/5 border-dashed rounded-xl bg-[#1d2026]/30">
                <p className="text-[#8c909f] mb-4">You haven't created any rooms yet.</p>
                <Link to="/rooms/new" className="bg-[#3B82F6] hover:bg-[#2563eb] text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors inline-block">
                  Create your first room
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="flex justify-end gap-3 pt-6 border-t border-white/5">
          <button onClick={() => navigate({ to: "/settings" })} className="px-6 py-2.5 rounded-lg border border-white/10 text-[#c2c6d6] hover:bg-white/5 transition-colors font-medium">Edit settings</button>
          <button onClick={() => { logout(); navigate({ to: "/" }); }} className="px-6 py-2.5 rounded-lg bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444] hover:text-white font-bold transition-colors">Sign out</button>
        </section>
      </main>
    </AppShell>
  );
}
