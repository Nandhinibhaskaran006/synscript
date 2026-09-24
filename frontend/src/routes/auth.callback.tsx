import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { takeRedirect } from "../lib/auth";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({ meta: [{ title: "Authenticating | SYNCSCRIPT" }] }),
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuth() {
      if (typeof window === "undefined") return;

      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      const error = urlParams.get("error");

      if (error) {
        setErrorMsg(decodeURIComponent(error));
        setTimeout(() => {
          navigate({ to: "/login" });
        }, 3000);
        return;
      }

      if (token) {
        try {
          window.localStorage.setItem("token", token);
          window.localStorage.setItem("syncscript_loggedin", "1");
          await refreshAuth();
          const dest = takeRedirect() || "/dashboard";
          navigate({ to: dest as any });
        } catch (err: any) {
          console.error("OAuth token processing error:", err);
          setErrorMsg("Failed to authenticate session. Please try logging in again.");
          setTimeout(() => {
            navigate({ to: "/login" });
          }, 3000);
        }
      } else {
        navigate({ to: "/login" });
      }
    }

    handleAuth();
  }, [navigate, refreshAuth]);

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#e1e2eb] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-[#3B82F6]/10 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="relative z-10 max-w-md w-full text-center space-y-6 bg-[#10131a]/80 backdrop-blur border border-white/10 p-8 rounded-2xl shadow-2xl">
        <div className="inline-flex items-center justify-center p-4 rounded-2xl bg-[#adc6ff]/10 border border-[#adc6ff]/20 mb-2">
          <span className="material-symbols-outlined text-[#adc6ff] text-4xl animate-pulse">
            terminal
          </span>
        </div>

        {errorMsg ? (
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-[#ef4444]">Authentication Failed</h2>
            <p className="text-sm text-[#8c909f] font-mono">{errorMsg}</p>
            <p className="text-xs text-[#8c909f]">Redirecting back to login...</p>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight text-white">Authenticating with SYNCSCRIPT</h2>
            <p className="text-sm text-[#8c909f]">Setting up your secure collaborative workspace...</p>
            <div className="flex justify-center pt-2">
              <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
