import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({ meta: [{ title: "Accept Invitation | SYNCSCRIPT" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const { token } = Route.useParams();
  const { user, isLoggedIn, loading: authLoading } = useAuth();

  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    async function loadInvitation() {
      try {
        const res = await api.get(`/api/invitations/${token}`);
        setInvitation(res.data);
      } catch (err: any) {
        console.error("Failed to load invitation", err);
        setStatus({
          type: "error",
          message: err.response?.data?.message || "Invitation not found or invalid",
        });
      } finally {
        setLoading(false);
      }
    }
    loadInvitation();
  }, [token]);

  const handleAccept = async () => {
    if (!isLoggedIn) {
      // Store redirect target and send to login
      localStorage.setItem("syncscript_redirect", `/invite/${token}`);
      navigate({ to: "/login" });
      return;
    }

    setProcessing(true);
    setStatus(null);

    try {
      const res = await api.post("/api/invitations/accept", { token });
      setStatus({
        type: "success",
        message: "Invitation accepted! Redirecting to project room...",
      });
      setTimeout(() => {
        navigate({ to: "/room/$roomId", params: { roomId: res.data.roomId } });
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setStatus({
        type: "error",
        message: err.response?.data?.message || "Failed to accept invitation",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    setStatus(null);

    try {
      await api.post("/api/invitations/decline", { token });
      setStatus({
        type: "success",
        message: "Invitation declined.",
      });
      setTimeout(() => {
        navigate({ to: "/dashboard" });
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setStatus({
        type: "error",
        message: err.response?.data?.message || "Failed to decline invitation",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-[#0B0E14] text-[#e1e2eb] flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <span className="material-symbols-outlined text-4xl animate-spin text-[#3B82F6]">sync</span>
          <p className="text-sm text-[#8c909f]">Loading invitation details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#e1e2eb] flex flex-col justify-center items-center px-4 font-sans">
      <div className="w-full max-w-md bg-[#131722] border border-[#232936] rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-[#3B82F6]/20 text-[#3B82F6] rounded-2xl flex items-center justify-center text-3xl font-bold mb-3 border border-[#3B82F6]/40">
            <span className="material-symbols-outlined text-3xl">mail</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Project Invitation</h2>
          <p className="text-sm text-[#8c909f] mt-1 text-center">
            You've been invited to collaborate on SYNCSCRIPT
          </p>
        </div>

        {status && (
          <div
            className={`p-4 rounded-xl mb-6 text-sm flex items-start space-x-2 border ${
              status.type === "success"
                ? "bg-[#10b981]/10 border-[#10b981]/30 text-[#34d399]"
                : "bg-[#ef4444]/10 border-[#ef4444]/30 text-[#f87171]"
            }`}
          >
            <span>{status.message}</span>
          </div>
        )}

        {invitation && (
          <div className="space-y-6">
            <div className="bg-[#1c2230] border border-[#2e3648] rounded-xl p-5 space-y-3">
              <div>
                <span className="text-[10px] uppercase font-mono text-[#8c909f] block">Project Room</span>
                <span className="text-lg font-bold text-white">{invitation.roomName}</span>
                <span className="text-xs text-[#3B82F6] font-mono block mt-0.5">ID: {invitation.roomId}</span>
              </div>
              <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-[#c2c6d6]">
                <span>Invited by: <strong className="text-white">{invitation.inviterName}</strong></span>
                <span className="font-mono text-[#8c909f]">{invitation.inviteeEmail}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#8c909f] pt-1">
                <span>Status: <strong className="capitalize text-white">{invitation.status}</strong></span>
                <span>Expires: {new Date(invitation.expiresAt).toLocaleDateString()}</span>
              </div>
            </div>

            {invitation.status === "pending" && (
              <div className="space-y-3">
                <button
                  onClick={handleAccept}
                  disabled={processing}
                  className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-[#2563eb]/25 active:scale-[0.99] flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  {processing ? "Processing..." : "Accept Invitation"}
                </button>
                <button
                  onClick={handleDecline}
                  disabled={processing}
                  className="w-full border border-white/10 hover:bg-white/5 text-[#c2c6d6] font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  Decline
                </button>
              </div>
            )}

            {invitation.status === "accepted" && (
              <Link
                to="/room/$roomId"
                params={{ roomId: invitation.roomId }}
                className="w-full bg-[#3B82F6] text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all block text-center"
              >
                Enter Project Room
              </Link>
            )}

            {invitation.status === "declined" && (
              <p className="text-sm text-center text-rose-400">This invitation was declined.</p>
            )}

            {invitation.status === "expired" && (
              <p className="text-sm text-center text-amber-400">This invitation link has expired.</p>
            )}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-[#1e2533] text-center">
          <Link to="/dashboard" className="text-sm text-[#3b82f6] hover:underline font-medium">
            &larr; Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
