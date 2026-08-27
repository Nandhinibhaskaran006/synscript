import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import api from "../api/axios";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Set New Password | SYNCSCRIPT" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const searchParams = useSearch({ from: "/reset-password" }) as { token?: string };
  const token = searchParams.token || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || !confirmPassword) return;

    if (password !== confirmPassword) {
      setStatus({ type: "error", message: "Passwords do not match" });
      return;
    }

    if (password.length < 6) {
      setStatus({ type: "error", message: "Password must be at least 6 characters" });
      return;
    }

    if (!token) {
      setStatus({ type: "error", message: "Missing reset token. Please use the link sent to your email." });
      return;
    }

    setLoading(true);
    setStatus(null);

    try {
      const res = await api.post("/api/auth/reset-password", { token, password });
      setStatus({
        type: "success",
        message: res.data.message || "Password reset successfully! Redirecting to login...",
      });
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 2000);
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Failed to reset password. Link may be expired.";
      setStatus({ type: "error", message: errMsg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#e1e2eb] flex flex-col justify-center items-center px-4 font-sans">
      <div className="w-full max-w-md bg-[#131722] border border-[#232936] rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#2563eb]/20 text-[#3b82f6] rounded-xl flex items-center justify-center text-2xl font-bold mb-3 border border-[#2563eb]/40">
            S
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Set New Password</h2>
          <p className="text-sm text-[#8c92a4] mt-1 text-center">
            Enter your new password below.
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

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-[#8c92a4] mb-2">
              New Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#1c2230] border border-[#2e3648] rounded-xl px-4 py-3 text-white placeholder-[#586174] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-[#8c92a4] mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-[#1c2230] border border-[#2e3648] rounded-xl px-4 py-3 text-white placeholder-[#586174] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-lg shadow-[#2563eb]/25 active:scale-[0.99]"
          >
            {loading ? "Updating..." : "Set New Password"}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#1e2533] text-center">
          <Link to="/login" className="text-sm text-[#3b82f6] hover:underline font-medium">
            &larr; Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
