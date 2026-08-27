// Lightweight client-side auth for the demo frontend.
const KEY = "syncscript_loggedin";
const REDIRECT_KEY = "syncscript_redirect_after_login";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return true; // don't redirect during SSR
  return !!window.localStorage.getItem("token");
}
export function login() {
  if (typeof window !== "undefined") window.localStorage.setItem(KEY, "1");
}
export function logout() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem("token");
  }
}
export function setRedirect(path: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(REDIRECT_KEY, path);
}
export function takeRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(REDIRECT_KEY);
  if (v) window.localStorage.removeItem(REDIRECT_KEY);
  return v;
}
