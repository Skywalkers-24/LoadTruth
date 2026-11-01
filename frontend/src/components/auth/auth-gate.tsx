"use client";

import { useEffect } from "react";
import { Loader2Icon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth";
import { LoginScreen } from "@/components/auth/login-screen";

// Routes that render without a login. The public showcase is the submission's
// front door; it reads no tenant data, so it needs no session.
// /login and /superadmin are public so users can view the login screen or superadmin portal.
const PUBLIC_PREFIXES = ["/showcase", "/login", "/superadmin"];

function isPublicPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Renders the login screen until a member is signed in, then the app. While the
 * stored session is being verified on first load, shows a minimal spinner so
 * there is no flash of the login screen for an already-signed-in user. Public
 * routes (the showcase and /login) render for everyone, signed in or not.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { member, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !member && pathname && pathname !== "/" && !isPublicPath(pathname)) {
      router.replace("/login");
    }
  }, [loading, member, pathname, router]);

  if (isPublicPath(pathname)) return <>{children}</>;

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-background text-muted-foreground">
        <Loader2Icon className="size-6 animate-spin" />
      </div>
    );
  }

  if (!member) return <LoginScreen />;

  return <>{children}</>;
}
