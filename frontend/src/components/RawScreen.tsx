import { useEffect, useRef, type MouseEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { isLoggedIn, login, setRedirect, takeRedirect } from "@/lib/auth";

interface Props {
  html: string;
  className?: string;
  style?: React.CSSProperties;
  /** If true, the component requires login; unauthenticated users are sent to /login. */
  requireAuth?: boolean;
}

/**
 * Renders raw HTML and intercepts navigation:
 *  - [data-route="/x"]        : plain client navigation
 *  - [data-auth-route="/x"]   : requires login, else /login (with redirect-back)
 *  - [data-login]             : performs login then redirects to stored target or /dashboard
 *  - <form data-route|...>    : same semantics on submit
 */
export function RawScreen({ html, className, style, requireAuth }: Props) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  // Guard the whole screen if needed.
  useEffect(() => {
    if (requireAuth && !isLoggedIn()) {
      setRedirect(window.location.pathname);
      navigate({ to: "/login" });
    }
  }, [requireAuth, navigate]);

  const handle = (el: HTMLElement | null) => {
    if (!el) return false;
    if (el.hasAttribute("data-login")) {
      login();
      const dest = takeRedirect() || "/dashboard";
      navigate({ to: dest });
      return true;
    }
    const authRoute = el.getAttribute("data-auth-route");
    if (authRoute) {
      if (isLoggedIn()) navigate({ to: authRoute });
      else { setRedirect(authRoute); navigate({ to: "/login" }); }
      return true;
    }
    const route = el.getAttribute("data-route");
    if (route) {
      navigate({ to: route });
      return true;
    }
    return false;
  };

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-route],[data-auth-route],[data-login]",
    );
    if (target && handle(target)) e.preventDefault();
  };

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onSubmit = (e: Event) => {
      const form = (e.target as HTMLElement).closest<HTMLFormElement>(
        "form[data-route],form[data-auth-route],form[data-login]",
      );
      if (form) {
        e.preventDefault();
        handle(form);
      }
    };
    root.addEventListener("submit", onSubmit);
    return () => root.removeEventListener("submit", onSubmit);
  });

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
