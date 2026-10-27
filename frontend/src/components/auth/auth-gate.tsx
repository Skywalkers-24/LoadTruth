"use client";

import { Loader2Icon } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { LoginScreen } from "@/components/auth/login-screen";

/**
 * Renders the login screen until a member is signed in, then the app. While the
 * stored session is being verified on first load, shows a minimal spinner so
 * there is no flash of the login screen for an already-signed-in user.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { member, loading } = useAuth();

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
