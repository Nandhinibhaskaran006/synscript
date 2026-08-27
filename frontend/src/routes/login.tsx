import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { RawScreen } from "../components/RawScreen";
import { useAuth } from "../context/AuthContext";
import { takeRedirect } from "../lib/auth";
import html from "../screens/body_2.html?raw";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Login | SYNCSCRIPT" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const form = document.getElementById("loginForm") as HTMLFormElement | null;
    if (!form) return;

    // Remove mock login interceptor behavior
    form.removeAttribute("data-login");

    const handleSubmit = async (e: Event) => {
      e.preventDefault();
      const formData = new FormData(form);
      const email = formData.get("email") as string;
      const password = formData.get("password") as string;

      try {
        await login(email, password);
        const dest = takeRedirect() || "/dashboard";
        navigate({ to: dest });
      } catch (err: any) {
        console.error(err);
        const errMsg = err.response?.data?.message || "Invalid email or password";
        alert(errMsg);
      }
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [login, navigate]);

  // Replace waitlist link with register link dynamically
  const customizedHtml = html
    .replace("Don't have an account? <a class=\"text-primary hover:underline font-semibold\" href=\"#\">Join the waitlist</a>", "Don't have an account? <a class=\"text-primary hover:underline font-semibold\" href=\"#\" data-route=\"/register\">Register</a>");

  return (
    <RawScreen html={customizedHtml} className="bg-[#0B0E14] text-[#e1e2eb] min-h-screen" />
  );
}
