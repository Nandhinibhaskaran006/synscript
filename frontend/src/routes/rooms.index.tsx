import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isLoggedIn, setRedirect } from "@/lib/auth";
import { AppShell } from "../components/AppShell";
import api from "../api/axios";

type Room = {
  roomId: string;
  name: string;
  language: string;
  members: { _id: string; username: string }[];
  isPrivate: boolean;
  createdAt: string;
};

export const Route = createFileRoute("/rooms/")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | My Rooms" }] }),
  component: RoomsPage,
});

function RoomsPage() {
  useEffect(() => {
    if (!isLoggedIn()) {
      setRedirect("/rooms");
      window.location.assign("/login");
    }
  }, []);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) {
      setRedirect("/rooms");
      window.location.assign("/login");
      return;
    }

    async function loadRooms() {
      try {
        const res = await api.get('/api/rooms');
        setRooms(res.data);
      } catch (error) {
        console.error("Failed to load rooms", error);
      } finally {
        setLoading(false);
      }
    }
    loadRooms();
  }, []);

  return (
    <AppShell>
      <main className="p-8 space-y-10">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Rooms</h1>
            <p className="text-[#8c909f] mt-1 text-sm">All collaborative rooms you own or have joined. Click any room to enter the live editor.</p>
          </div>
          <Link
            to="/room/$roomId"
            params={{ roomId: `new-${Date.now().toString(36)}` }}
            className="flex items-center gap-2 bg-[#adc6ff] hover:bg-[#4d8eff] text-[#002e6a] px-5 py-2.5 rounded-lg font-bold transition-all shadow-lg shadow-[#adc6ff]/20"
          >
            <span className="material-symbols-outlined text-[20px]">add_box</span>
            New Room
          </Link>
        </header>

        <section>
          {loading ? (
            <div className="text-center py-10 text-[#8c909f]">Loading rooms...</div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-10 text-[#8c909f]">
              <p className="mb-4">No rooms found. Create a room to get started!</p>
              <Link
                to="/rooms/new"
                className="inline-flex items-center gap-2 bg-[#3B82F6] text-white px-5 py-2.5 rounded-lg font-bold transition-all shadow-lg shadow-[#3B82F6]/30 hover:bg-[#2563eb]"
              >
                <span className="material-symbols-outlined text-[20px]">add_box</span>
                Create New Room
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-lg font-bold">My Rooms</h2>
                <span className="bg-[#25C2A0]/10 text-[#25C2A0] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-[#25C2A0] rounded-full animate-pulse"></span>
                  {rooms.length}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {rooms.map((r) => (
                  <RoomCard key={r.roomId} room={r} />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </AppShell>
  );
}

function RoomCard({ room }: { room: Room }) {
  const langColors: Record<string, string> = {
    javascript: "text-status-warning",
    typescript: "text-syntax-pink",
    python: "text-status-warning",
    java: "text-syntax-cyan",
    go: "text-primary",
    rust: "text-syntax-pink",
    "c++": "text-syntax-cyan",
  };
  const langColor = langColors[room.language.toLowerCase()] || "text-syntax-cyan";

  return (
    <Link
      to="/room/$roomId"
      params={{ roomId: room.roomId }}
      className="group relative block rounded-xl p-5 border border-white/5 bg-[#1d2026]/70 backdrop-blur hover:border-[#3B82F6]/30 transition-all duration-200 active:scale-[0.98]"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col">
          <span className="font-bold text-[#e1e2eb] truncate pr-4">{room.name}</span>
          <span className={`text-[11px] font-mono ${langColor}`}>{room.language}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[#8c909f] bg-white/5 px-2 py-1 rounded">
          <span className="material-symbols-outlined text-[14px]">group</span>
          <span className="text-[11px] font-bold">{room.members.length}</span>
        </div>
      </div>
      <div className="h-24 w-full rounded bg-[#0B0E14] border border-white/5 p-3 overflow-hidden mb-4 font-mono text-[11px] space-y-1 opacity-80">
        <div className="text-status-active">// {room.name}</div>
        <div className="text-on-surface-variant">// language: {room.language}</div>
        <div className="text-syntax-cyan">// start coding...</div>
      </div>
      <div className="flex items-center justify-between">
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
        <span className="bg-[#3B82F6]/10 group-hover:bg-[#3B82F6] text-[#3B82F6] group-hover:text-white px-3 py-1.5 rounded font-bold text-xs transition-all">
          Enter →
        </span>
      </div>
    </Link>
  );
}
