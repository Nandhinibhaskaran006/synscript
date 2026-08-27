import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isLoggedIn, setRedirect } from "@/lib/auth";
import { getUserRooms } from "@/lib/user-rooms";
import { AppShell } from "../components/AppShell";

type Room = {
  id: string;
  name: string;
  lang: string;
  langColor: string;
  members: string[];
  capacity: number;
  active: boolean;
  snippet: { text: string; cls: string }[];
};

const ROOMS: Room[] = [
  {
    id: "auth-microservice",
    name: "auth-microservice",
    lang: "TypeScript",
    langColor: "text-syntax-pink",
    members: ["Sarah", "Alex", "Mia"],
    capacity: 5,
    active: true,
    snippet: [
      { text: "async function verify() {", cls: "text-syntax-cyan" },
      { text: "  const token = req.headers;", cls: "text-on-surface-variant" },
      { text: "  // Validate JWT...", cls: "text-status-active" },
    ],
  },
  {
    id: "data-pipeline-v3",
    name: "data-pipeline-v3",
    lang: "Python",
    langColor: "text-status-warning",
    members: ["Jordan", "Priya"],
    capacity: 5,
    active: true,
    snippet: [
      { text: "def process_batch(data):", cls: "text-syntax-pink" },
      { text: "  for item in data:", cls: "text-on-surface-variant" },
      { text: "    yield transform(item)", cls: "text-syntax-cyan" },
    ],
  },
  {
    id: "frontend-revamp",
    name: "frontend-revamp",
    lang: "React",
    langColor: "text-syntax-cyan",
    members: ["Mia", "Devon", "Sarah", "Leo", "Kai"],
    capacity: 8,
    active: true,
    snippet: [
      { text: "const Dashboard = () => {", cls: "text-syntax-cyan" },
      { text: "  return (", cls: "text-syntax-pink" },
      { text: '    <div className="grid" />', cls: "text-on-surface-variant" },
    ],
  },
  {
    id: "go-scraper",
    name: "go-scraper",
    lang: "Golang",
    langColor: "text-primary",
    members: ["Devon"],
    capacity: 3,
    active: false,
    snippet: [
      { text: "func main() {", cls: "text-syntax-pink" },
      { text: "  c := colly.NewCollector()", cls: "text-on-surface-variant" },
      { text: '  c.OnHTML("a", ...)', cls: "text-syntax-cyan" },
    ],
  },
  {
    id: "ss-49x-z2",
    name: "playground",
    lang: "JavaScript",
    langColor: "text-status-warning",
    members: ["Alex"],
    capacity: 4,
    active: false,
    snippet: [
      { text: "// scratch pad", cls: "text-status-active" },
      { text: "console.log('hi');", cls: "text-on-surface-variant" },
    ],
  },
];

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

  const [userRooms, setUserRooms] = useState<Room[]>([]);
  useEffect(() => {
    const ur = getUserRooms().map((r): Room => ({
      id: r.id, name: r.name, lang: r.lang, langColor: "text-syntax-cyan",
      members: r.members, capacity: r.capacity, active: true,
      snippet: [
        { text: `// ${r.name}`, cls: "text-status-active" },
        { text: `// language: ${r.lang}`, cls: "text-on-surface-variant" },
        { text: "// start coding...", cls: "text-syntax-cyan" },
      ],
    }));
    setUserRooms(ur);
  }, []);

  const active = [...userRooms, ...ROOMS.filter((r) => r.active)];
  const all = [...userRooms, ...ROOMS];

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
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-bold">Active Rooms</h2>
            <span className="bg-[#25C2A0]/10 text-[#25C2A0] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-[#25C2A0] rounded-full animate-pulse"></span>LIVE
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {active.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold mb-4">All Rooms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {all.map((r) => (
              <RoomCard key={r.id} room={r} />
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function RoomCard({ room }: { room: Room }) {
  return (
    <Link
      to="/room/$roomId"
      params={{ roomId: room.id }}
      className="group relative block rounded-xl p-5 border border-white/5 bg-[#1d2026]/70 backdrop-blur hover:border-[#4d8eff] hover:bg-[#4d8eff]/5 transition-all duration-200 active:scale-[0.98]"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col">
          <span className="font-bold text-[#e1e2eb] truncate pr-4">{room.name}</span>
          <span className={`text-[11px] font-mono ${room.langColor}`}>{room.lang}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[#8c909f] bg-white/5 px-2 py-1 rounded">
          <span className="material-symbols-outlined text-[14px]">group</span>
          <span className="text-[11px] font-bold">{room.members.length}/{room.capacity}</span>
        </div>
      </div>
      <div className="h-24 w-full rounded bg-[#0B0E14] border border-white/5 p-3 overflow-hidden mb-4 font-mono text-[11px] space-y-1 opacity-80">
        {room.snippet.map((s, i) => (
          <div key={i} className={s.cls}>{s.text}</div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1">
          {room.members.slice(0, 4).map((m) => (
            <span key={m} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#c2c6d6] border border-white/10">{m}</span>
          ))}
          {room.members.length > 4 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#8c909f]">+{room.members.length - 4}</span>
          )}
        </div>
        <span className="bg-[#adc6ff]/10 group-hover:bg-[#4d8eff] text-[#adc6ff] group-hover:text-white px-3 py-1.5 rounded font-bold text-xs transition-all">
          Enter →
        </span>
      </div>
    </Link>
  );
}
