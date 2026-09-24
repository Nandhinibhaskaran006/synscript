// Lightweight client-side auth helpers for SYNCSCRIPT
const KEY = "syncscript_loggedin";
const REDIRECT_KEY = "syncscript_redirect_after_login";

export function isLoggedIn(): boolean {
  if (typeof window === "undefined") return true; // don't redirect during SSR
  const token = window.localStorage.getItem("token");
  return !!token && token !== "null" && token !== "undefined";
}

export function login() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, "1");
  }
}

export function logout() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem("token");
    window.localStorage.removeItem("user");
    window.localStorage.removeItem("syncscript_active_roomId");
  }
}

export function setRedirect(path: string) {
  if (typeof window !== "undefined" && path && path !== "/login" && path !== "/register") {
    window.localStorage.setItem(REDIRECT_KEY, path);
  }
}

export function takeRedirect(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(REDIRECT_KEY) || window.localStorage.getItem("syncscript_redirect");
  if (v) {
    window.localStorage.removeItem(REDIRECT_KEY);
    window.localStorage.removeItem("syncscript_redirect");
  }
  return v;
}

