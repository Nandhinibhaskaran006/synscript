import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import api from "../api/axios";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot Password | SYNCSCRIPT" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setStatus(null);

    try {
      const res = await api.post("/api/auth/forgot-password", { email });
      setStatus({
        type: "success",
        message: res.data.message || "Password reset instructions sent to your email.",
      });
      setEmail("");
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.message || "Failed to process request. Please try again.";
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
          <h2 className="text-2xl font-bold text-white tracking-tight">Reset Your Password</h2>
          <p className="text-sm text-[#8c92a4] mt-1 text-center">
            Enter your account email to receive a password reset link.
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
            <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[#8c92a4] mb-2">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-[#1c2230] border border-[#2e3648] rounded-xl px-4 py-3 text-white placeholder-[#586174] focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-all duration-200 shadow-lg shadow-[#2563eb]/25 active:scale-[0.99]"
          >
            {loading ? "Sending..." : "Send Password Reset Link"}
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
