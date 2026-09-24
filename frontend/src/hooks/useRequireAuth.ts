import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { isLoggedIn, setRedirect } from "../lib/auth";
import { useAuth } from "../context/AuthContext";

export function useRequireAuth() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!isLoggedIn()) {
      setRedirect(pathname);
      navigate({ to: "/login" });
    } else if (!loading && !user) {
      setRedirect(pathname);
      navigate({ to: "/login" });
    }
  }, [loading, user, pathname, navigate]);

  return { user, loading: loading || (!user && isLoggedIn()), isAuthenticated: isLoggedIn() && !!user };
}
