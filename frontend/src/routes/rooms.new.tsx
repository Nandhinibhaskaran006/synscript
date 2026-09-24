import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAuth } from "../hooks/useRequireAuth";
import { AppShell } from "../components/AppShell";
import api from "../api/axios";

export const Route = createFileRoute("/rooms/new")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Create Room" }] }),
  component: NewRoomPage,
});

const LANGS = ["Python", "JavaScript", "Java", "TypeScript", "Go", "Rust", "C++"];

function NewRoomPage() {
  const navigate = useNavigate();
  const { user } = useRequireAuth();

  const [name, setName] = useState("");
  const [lang, setLang] = useState("Python");
  const [visibility, setVisibility] = useState<"Public" | "Private">("Public");
  const [collab, setCollab] = useState("");
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [created, setCreated] = useState<{ id: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const addCollab = () => {
    const v = collab.trim();
    if (v && !collaborators.includes(v)) setCollaborators([...collaborators, v]);
    setCollab("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/rooms/create', {
        name,
        language: lang.toLowerCase(),
      });
      const roomData = res.data;

      // Store active room ID
      localStorage.setItem("syncscript_active_roomId", roomData.roomId);

      navigate({ to: "/room/$roomId", params: { roomId: roomData.roomId } });
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to create room");
    }
  };

  const copyLink = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <AppShell>
      <div className="relative min-h-screen overflow-hidden">
        {/* Atmospheric glows */}
        <div className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute -top-40 -left-20 w-[600px] h-[600px] bg-[#3B82F6]/10 rounded-full blur-[120px]" />
          <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] bg-[#adc6ff]/10 rounded-full blur-[120px]" />
          <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "linear-gradient(#adc6ff 1px, transparent 1px), linear-gradient(90deg, #adc6ff 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>

        <main className="relative z-10 min-h-screen flex items-center justify-center p-8">
          <div className="w-full max-w-[460px]">
            {/* Header brand */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center p-3 rounded-xl bg-[#1d2026] border border-white/10 mb-4 shadow-lg shadow-[#3B82F6]/10">
                <span className="material-symbols-outlined text-[#adc6ff] text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>add_box</span>
              </div>
              <h1 className="text-3xl font-bold text-[#e1e2eb] tracking-tight">Create a New Room</h1>
              <p className="text-[#8c909f] text-sm mt-1.5">Spin up a collaborative coding space in seconds.</p>
            </div>

            {/* Create card */}
            <div className="bg-[#1d2026]/80 backdrop-blur-xl border border-white/10 rounded-xl p-8 shadow-2xl shadow-black/40">
              {!created ? (
                <form onSubmit={submit} className="space-y-5">
                  {/* Room name */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8c909f] block ml-1">Room Name</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8c909f] text-[20px]">tag</span>
                      <input value={name} onChange={e => setName(e.target.value)} required placeholder="payments-service" className="w-full pl-10 pr-4 py-2.5 bg-[#0B0E14] border border-white/10 rounded-lg text-sm text-[#e1e2eb] placeholder:text-[#8c909f]/50 focus:ring-1 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none transition" />
                    </div>
                  </div>

                  {/* Language */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8c909f] block ml-1">Programming Language</label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8c909f] text-[20px]">code</span>
                      <select value={lang} onChange={e => setLang(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-[#0B0E14] border border-white/10 rounded-lg text-sm text-[#e1e2eb] focus:ring-1 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none transition appearance-none">
                        {LANGS.map(l => <option key={l}>{l}</option>)}
                      </select>
                      <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-[#8c909f] text-[20px] pointer-events-none">expand_more</span>
                    </div>
                  </div>

                  {/* Visibility */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8c909f] block ml-1">Visibility</label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["Public", "Private"] as const).map(v => (
                        <button type="button" key={v} onClick={() => setVisibility(v)} className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm border transition ${visibility === v ? "bg-[#3B82F6]/15 border-[#3B82F6] text-[#adc6ff]" : "bg-[#0B0E14] border-white/10 text-[#c2c6d6] hover:border-white/20"}`}>
                          <span className="material-symbols-outlined text-[18px]">{v === "Public" ? "public" : "lock"}</span>
                          <span className="font-semibold">{v}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Collaborators */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8c909f] block ml-1">Collaborators</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8c909f] text-[20px]">person_add</span>
                        <input value={collab} onChange={e => setCollab(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCollab(); } }} placeholder="username or email" className="w-full pl-10 pr-4 py-2.5 bg-[#0B0E14] border border-white/10 rounded-lg text-sm text-[#e1e2eb] placeholder:text-[#8c909f]/50 focus:ring-1 focus:ring-[#3B82F6] focus:border-[#3B82F6] outline-none transition" />
                      </div>
                      <button type="button" onClick={addCollab} className="btn-flashlight px-4 py-2.5 rounded-lg bg-[#3B82F6] text-white font-semibold hover:bg-[#2563eb] transition">Add</button>
                    </div>
                    {collaborators.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {collaborators.map(m => (
                          <span key={m} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-[#3B82F6]/15 text-[#adc6ff] border border-[#3B82F6]/30">
                            {m}<button type="button" onClick={() => setCollaborators(collaborators.filter(x => x !== m))} className="text-[#adc6ff]/70 hover:text-white ml-0.5">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Create button */}
                  <button type="submit" className="w-full btn-flashlight py-2.5 mt-2 bg-[#3B82F6] hover:bg-[#2563eb] text-white font-semibold rounded-lg shadow-lg shadow-[#3B82F6]/30 transition flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[20px]">rocket_launch</span>Create Room
                  </button>

                  <div className="text-center pt-2">
                    <Link to="/rooms" className="text-xs text-[#8c909f] hover:text-[#adc6ff] transition">← Back to My Rooms</Link>
                  </div>
                </form>
              ) : (
                <div className="space-y-5">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#3B82F6]/20 border border-[#3B82F6]/40 mb-3">
                      <span className="material-symbols-outlined text-[#adc6ff] text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    </div>
                    <h2 className="text-xl font-bold text-[#e1e2eb]">Room created!</h2>
                    <p className="text-[#8c909f] text-sm mt-1">Share the link to invite collaborators.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-mono uppercase tracking-wider text-[#8c909f] block ml-1">Share Link</label>
                    <div className="flex gap-2">
                      <input readOnly value={created.link} className="flex-1 bg-[#0B0E14] border border-white/10 rounded-lg px-4 py-2.5 text-xs font-mono text-[#adc6ff]" />
                      <button onClick={copyLink} className="btn-flashlight px-4 py-2.5 rounded-lg bg-[#3B82F6] text-white font-semibold hover:bg-[#2563eb] transition min-w-[90px]">{copied ? "Copied ✓" : "Copy"}</button>
                    </div>
                  </div>

                  <div className="bg-[#0B0E14] border border-white/5 rounded-lg p-4 text-sm space-y-2">
                    <div className="flex justify-between"><span className="text-[#8c909f]">Room ID</span><span className="font-mono text-[#e1e2eb]">{created.id}</span></div>
                    <div className="flex justify-between"><span className="text-[#8c909f]">Language</span><span className="text-[#e1e2eb]">{lang}</span></div>
                    <div className="flex justify-between"><span className="text-[#8c909f]">Visibility</span><span className="text-[#e1e2eb]">{visibility}</span></div>
                    <div className="flex justify-between"><span className="text-[#8c909f]">Collaborators</span><span className="text-[#e1e2eb]">{collaborators.length + 1}</span></div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => { setCreated(null); setName(""); setCollaborators([]); }} className="flex-1 py-2.5 rounded-lg border border-white/10 text-[#c2c6d6] hover:bg-white/5 transition text-sm font-semibold">Create another</button>
                    <button onClick={() => navigate({ to: "/room/$roomId", params: { roomId: created.id } })} className="flex-1 btn-flashlight py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563eb] text-white font-semibold shadow-lg shadow-[#3B82F6]/30 transition text-sm">Enter room →</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
