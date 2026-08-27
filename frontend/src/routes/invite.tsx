import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isLoggedIn, setRedirect } from "@/lib/auth";
import { getReceivedInvites, getSentInvites, type Invite } from "@/lib/user-rooms";
import { AppShell } from "../components/AppShell";
import api from "../api/axios";

export const Route = createFileRoute("/invite")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Invites" }] }),
  component: InvitePage,
});

type Room = { roomId: string; name: string };

function InvitePage() {
  useEffect(() => {
    if (!isLoggedIn()) { setRedirect("/invite"); window.location.assign("/login"); }
  }, []);

  const [received, setReceived] = useState<Invite[]>([]);
  const [sent, setSent] = useState<Invite[]>([]);
  const [to, setTo] = useState("");
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sendStatus, setSendStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setReceived(getReceivedInvites());
    setSent(getSentInvites());
    // Load user's real rooms from backend
    api.get("/api/rooms").then(res => {
      setRooms(res.data || []);
    }).catch(() => {});
  }, []);

  const act = async (token: string, status: "accepted" | "declined") => {
    try {
      if (status === "accepted") {
        const res = await api.post("/api/invitations/accept", { token });
        window.location.assign(`/room/${res.data.roomId}`);
      } else {
        await api.post("/api/invitations/decline", { token });
        window.location.reload();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to update invitation");
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!to.trim() || !roomId.trim()) {
      setSendStatus({ type: "error", message: "Please enter an email and select a room." });
      return;
    }
    setSending(true);
    setSendStatus(null);
    try {
      const res = await api.post("/api/invitations/send", {
        roomId: roomId.trim(),
        inviteeEmail: to.trim(),
      });
      setSendStatus({ type: "success", message: res.data.message || "Invitation sent successfully!" });
      setTo("");
      setRoomId("");
    } catch (err: any) {
      setSendStatus({ type: "error", message: err.response?.data?.message || "Failed to send invitation" });
    } finally {
      setSending(false);
    }
  };

  return (
    <AppShell>
      <main className="p-10 space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Invites</h1>
          <p className="text-[#8c909f] mt-1 text-sm">Review invitations you've received and send new ones to your friends.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Received */}
          <section className="bg-[#1d2026]/70 border border-white/5 rounded-2xl p-6 backdrop-blur">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#3B82F6]">inbox</span>
              <h2 className="text-lg font-bold">Received invitations</h2>
              <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[#3B82F6]/20 text-[#adc6ff]">{received.filter(i => i.status === "pending").length} pending</span>
            </div>
            <div className="space-y-3">
              {received.length === 0 && <p className="text-sm text-[#8c909f]">No invitations yet.</p>}
              {received.map(i => (
                <div key={i.id} className="p-4 rounded-xl bg-[#0B0E14] border border-white/5 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#3B82F6]/20 flex items-center justify-center text-[#adc6ff] font-bold">{i.from[0]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm"><span className="font-semibold">{i.from}</span> invited you to <span className="font-mono text-[#adc6ff]">{i.roomName}</span></div>
                    <div className="text-[11px] text-[#8c909f]">{new Date(i.createdAt).toLocaleString()}</div>
                  </div>
                  {i.status === "pending" ? (
                    <div className="flex gap-2">
                      <Link to="/room/$roomId" params={{ roomId: i.roomId }} onClick={() => act(i.id, "accepted")} className="px-3 py-1.5 rounded-md bg-[#3B82F6] hover:bg-[#2563eb] text-white text-xs font-bold">Accept</Link>
                      <button onClick={() => act(i.id, "declined")} className="px-3 py-1.5 rounded-md border border-white/10 text-[#c2c6d6] hover:bg-white/5 text-xs font-bold">Decline</button>
                    </div>
                  ) : (
                    <span className={`text-xs font-bold px-2 py-1 rounded ${i.status === "accepted" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{i.status}</span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Send */}
          <section className="bg-[#1d2026]/70 border border-white/5 rounded-2xl p-6 backdrop-blur">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#3B82F6]">send</span>
              <h2 className="text-lg font-bold">Send invitation</h2>
            </div>

            {sendStatus && (
              <div className={`mb-4 p-3 rounded-xl text-sm border ${
                sendStatus.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-red-500/10 border-red-500/30 text-red-300"
              }`}>
                {sendStatus.message}
              </div>
            )}

            <form onSubmit={send} className="space-y-3">
              <input
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="Friend's email address"
                type="email"
                className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:border-[#3B82F6] outline-none"
              />
              {rooms.length > 0 ? (
                <select
                  value={roomId}
                  onChange={e => setRoomId(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:border-[#3B82F6] outline-none text-[#e1e2eb]"
                >
                  <option value="">Select a room to invite to...</option>
                  {rooms.map(r => (
                    <option key={r.roomId} value={r.roomId}>{r.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={roomId}
                  onChange={e => setRoomId(e.target.value)}
                  placeholder="Room ID"
                  className="w-full bg-[#0B0E14] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:border-[#3B82F6] outline-none"
                />
              )}
              <button
                type="submit"
                disabled={sending}
                className="w-full px-5 py-2.5 rounded-lg bg-[#3B82F6] hover:bg-[#2563eb] disabled:opacity-50 text-white font-bold transition-colors"
              >
                {sending ? "Sending..." : "Send invite"}
              </button>
            </form>

            <div className="mt-6">
              <div className="text-xs uppercase tracking-wider text-[#8c909f] font-mono mb-2">Sent</div>
              <div className="space-y-2">
                {sent.length === 0 && <p className="text-sm text-[#8c909f]">No invites sent yet.</p>}
                {sent.map(i => (
                  <div key={i.id} className="p-3 rounded-lg bg-[#0B0E14] border border-white/5 text-sm flex justify-between">
                    <span>To <span className="font-semibold">{i.to}</span> — <span className="font-mono text-[#adc6ff]">{i.roomName}</span></span>
                    <span className="text-xs text-[#8c909f]">{i.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
