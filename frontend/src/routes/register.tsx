import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { RawScreen } from "../components/RawScreen";
import { useAuth } from "../context/AuthContext";
import html from "../screens/body_2.html?raw";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Register | SYNCSCRIPT" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Username input HTML styled exactly like the email input field in body_2.html
  const usernameFieldHtml = `
<div class="space-y-2">
  <label class="font-label-caps text-outline block ml-1" for="username">USERNAME</label>
  <div class="relative">
    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">person</span>
    <input class="w-full pl-10 pr-4 py-2.5 bg-surface-container-lowest border border-white/10 rounded-lg font-body-base text-on-surface placeholder:text-outline/50 focus:ring-1 focus:ring-primary focus:border-primary transition-all input-glow outline-none" id="username" name="username" placeholder="username" required="" type="text"/>
  </div>
</div>
`;

  // Dynamically adapt login page template to fit the registration page
  const registerHtml = html
    .replace('id="loginForm" data-login="true"', 'id="registerForm"')
    .replace(
      '<h1 class="font-display-lg text-headline-md text-on-surface tracking-tight">SYNCSCRIPT</h1>',
      '<h1 class="font-display-lg text-headline-md text-on-surface tracking-tight">CREATE AN ACCOUNT</h1>'
    )
    .replace("Login with Email", "Create Account")
    .replace(
      "Don't have an account? <a class=\"text-primary hover:underline font-semibold\" href=\"#\">Join the waitlist</a>",
      'Already have an account? <a class="text-primary hover:underline font-semibold" href="#" data-route="/login">Login</a>'
    )
    .replace(
      '<label class="font-label-caps text-outline block ml-1" for="email">WORK EMAIL</label>',
      usernameFieldHtml + '<label class="font-label-caps text-outline block ml-1" for="email">WORK EMAIL</label>'
    );

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Query inside our wrapper div (not the entire document)
    const form = wrapper.querySelector<HTMLFormElement>("#registerForm");
    if (!form) {
      console.error("[RegisterPage] Could not find #registerForm in DOM.");
      return;
    }

    const handleSubmit = async (e: Event) => {
      e.preventDefault();
      e.stopPropagation(); // prevent RawScreen's own submit listener from firing

      const usernameInput = form.querySelector<HTMLInputElement>('[name="username"]');
      const emailInput = form.querySelector<HTMLInputElement>('[name="email"]');
      const passwordInput = form.querySelector<HTMLInputElement>('[name="password"]');

      const username = usernameInput?.value.trim() ?? "";
      const email = emailInput?.value.trim() ?? "";
      const password = passwordInput?.value ?? "";

      if (!username || !email || !password) {
        alert("Please fill in all fields: username, email, and password.");
        return;
      }

      console.log("[RegisterPage] Submitting:", { username, email });

      try {
        await register(username, email, password);
        navigate({ to: "/dashboard" });
      } catch (err: any) {
        console.error("[RegisterPage] Registration error:", err);
        const errMsg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          "Registration failed. Please try again.";
        alert(`Registration failed: ${errMsg}`);
      }
    };

    form.addEventListener("submit", handleSubmit);
    return () => form.removeEventListener("submit", handleSubmit);
  }, [register, navigate]);

  return (
    <div ref={wrapperRef}>
      <RawScreen html={registerHtml} className="bg-[#0B0E14] text-[#e1e2eb] min-h-screen" />
    </div>
  );
}
