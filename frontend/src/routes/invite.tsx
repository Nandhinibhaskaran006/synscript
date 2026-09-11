import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { isLoggedIn, setRedirect } from "@/lib/auth";
import { AppShell } from "../components/AppShell";
import api from "../api/axios";

export const Route = createFileRoute("/invite")({
  head: () => ({ meta: [{ title: "SYNCSCRIPT | Invites" }] }),
  component: InvitePage,
});

type Room = { roomId: string; name: string };

type ReceivedInvitation = {
  _id: string;
  roomId: string;
  roomName: string;
  inviterName: string;
  inviteeEmail: string;
  token: string;
  status: "pending" | "accepted" | "declined" | "expired";
  expiresAt: string;
  createdAt: string;
};

type SentInvitation = {
  _id: string;
  roomId: string;
  roomName: string;
  inviteeEmail: string;
  status: string;
  createdAt: string;
};

function InvitePage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoggedIn()) { setRedirect("/invite"); window.location.assign("/login"); }
  }, []);

  const [received, setReceived] = useState<ReceivedInvitation[]>([]);
  const [sent, setSent] = useState<SentInvitation[]>([]);
  const [loadingReceived, setLoadingReceived] = useState(true);
  const [loadingSent, setLoadingSent] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const [to, setTo] = useState("");
  const [roomId, setRoomId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sendStatus, setSendStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [sending, setSending] = useState(false);

  // Fetch real invitations from backend
  useEffect(() => {
    api.get("/api/invitations/received")
      .then(res => setReceived(res.data || []))
      .catch(err => console.error("Failed to fetch received invitations", err))
      .finally(() => setLoadingReceived(false));

    api.get("/api/invitations/sent")
      .then(res => setSent(res.data || []))
      .catch(err => console.error("Failed to fetch sent invitations", err))
      .finally(() => setLoadingSent(false));

    api.get("/api/rooms")
      .then(res => setRooms(res.data || []))
      .catch(() => {});
  }, []);

  // Accept invitation — calls real backend, then redirects to room
  const handleAccept = async (invitation: ReceivedInvitation) => {
    setProcessingId(invitation._id);
    try {
      const res = await api.post("/api/invitations/accept", { token: invitation.token });
      // Update local state immediately
      setReceived(prev => prev.map(inv =>
        inv._id === invitation._id ? { ...inv, status: "accepted" as const } : inv
      ));
      // Redirect to the room
      navigate({ to: "/room/$roomId", params: { roomId: res.data.roomId } });
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to accept invitation");
    } finally {
      setProcessingId(null);
    }
  };

  // Decline invitation — calls real backend, updates UI
  const handleDecline = async (invitation: ReceivedInvitation) => {
    setProcessingId(invitation._id);
    try {
      await api.post("/api/invitations/decline", { token: invitation.token });
      // Update local state immediately
      setReceived(prev => prev.map(inv =>
        inv._id === invitation._id ? { ...inv, status: "declined" as const } : inv
      ));
    } catch (err: any) {
      alert(err.response?.data?.message || "Failed to decline invitation");
    } finally {
      setProcessingId(null);
    }
  };

  // Send new invitation
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
      // Refresh sent list
      api.get("/api/invitations/sent")
        .then(r => setSent(r.data || []))
        .catch(() => {});
    } catch (err: any) {
      setSendStatus({ type: "error", message: err.response?.data?.message || "Failed to send invitation" });
    } finally {
      setSending(false);
    }
  };

  const pendingCount = received.filter(i => i.status === "pending").length;

  const statusBadge = (status: string) => {
    switch (status) {
      case "accepted":
        return <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">Accepted</span>;
      case "declined":
        return <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 border border-rose-500/20">Declined</span>;
      case "expired":
        return <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/20">Expired</span>;
      default:
        return <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/20">Pending</span>;
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
          {/* ── Received Invitations ───────────────────────────────────── */}
          <section className="bg-[#1d2026]/70 border border-white/5 rounded-2xl p-6 backdrop-blur">
            <div className="flex items-center gap-2 mb-5">
              <span className="material-symbols-outlined text-[#3B82F6]">inbox</span>
              <h2 className="text-lg font-bold">Received invitations</h2>
              {pendingCount > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[#3B82F6]/20 text-[#adc6ff]">
                  {pendingCount} pending
                </span>
              )}
            </div>

            {loadingReceived ? (
              <div className="flex items-center gap-2 text-sm text-[#8c909f] py-4">
                <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                Loading invitations...
              </div>
            ) : (
              <div className="space-y-3">
                {received.length === 0 && (
                  <p className="text-sm text-[#8c909f]">No invitations received yet.</p>
                )}
                {received.map(inv => {
                  const isProcessing = processingId === inv._id;
                  return (
                    <div key={inv._id} className="p-4 rounded-xl bg-[#0B0E14] border border-white/5 flex items-start gap-3">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-[#3B82F6]/20 flex items-center justify-center text-[#adc6ff] font-bold flex-shrink-0 text-sm">
                        {inv.inviterName?.[0]?.toUpperCase() || "?"}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          <span className="font-semibold text-white">{inv.inviterName}</span>
                          {" "}invited you to{" "}
                          <span className="font-mono text-[#adc6ff]">{inv.roomName}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11px] text-[#8c909f]">
                            {new Date(inv.createdAt).toLocaleString()}
                          </span>
                          <span className="text-[11px] text-[#8c909f]">·</span>
                          <span className="text-[11px] text-[#8c909f] font-mono">
                            Room: {inv.roomId}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex-shrink-0">
                        {inv.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAccept(inv)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-md bg-[#3B82F6] hover:bg-[#2563eb] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
                            >
                              {isProcessing ? (
                                <span className="material-symbols-outlined text-[13px] animate-spin">sync</span>
                              ) : (
                                <span className="material-symbols-outlined text-[13px]">check</span>
                              )}
                              Accept
                            </button>
                            <button
                              onClick={() => handleDecline(inv)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded-md border border-white/10 text-[#c2c6d6] hover:bg-white/5 disabled:opacity-50 text-xs font-bold transition-colors"
                            >
                              Decline
                            </button>
                          </div>
                        ) : (
                          statusBadge(inv.status)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Send Invitation ────────────────────────────────────────── */}
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

            {/* Sent invitations list */}
            <div className="mt-6">
              <div className="text-xs uppercase tracking-wider text-[#8c909f] font-mono mb-2">Sent</div>
              {loadingSent ? (
                <div className="flex items-center gap-2 text-sm text-[#8c909f] py-2">
                  <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                  Loading...
                </div>
              ) : (
                <div className="space-y-2">
                  {sent.length === 0 && <p className="text-sm text-[#8c909f]">No invites sent yet.</p>}
                  {sent.map(inv => (
                    <div key={inv._id} className="p-3 rounded-lg bg-[#0B0E14] border border-white/5 text-sm flex justify-between items-center">
                      <span>
                        To <span className="font-semibold">{inv.inviteeEmail}</span>
                        {" — "}
                        <span className="font-mono text-[#adc6ff]">{inv.roomName}</span>
                      </span>
                      {statusBadge(inv.status)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
