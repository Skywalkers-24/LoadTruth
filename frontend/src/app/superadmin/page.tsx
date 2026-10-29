"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, KeyRoundIcon, Loader2Icon, ShieldCheckIcon, TerminalIcon } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { LoginVideoBg } from "@/components/auth/login-video-bg";
import { LogoMark } from "@/components/ui/logo";
import { Button } from "@/components/ui/shadcn/button";
import { Card } from "@/components/ui/shadcn/card";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SuperAdminPage() {
  const router = useRouter();
  const { superAdminSignIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Please enter both username and password.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await superAdminSignIn(username.trim(), password);
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid username or password. Check .env hashed credentials.");
      setSubmitting(false);
    }
  }

  return (
    <div className="relative grid min-h-dvh overflow-hidden lg:grid-cols-2">
      {/* Background video banner */}
      <LoginVideoBg />

      {/* Brand panel */}
      <div className="relative z-10 hidden min-h-0 flex-col justify-between overflow-hidden p-8 text-sidebar-foreground lg:flex xl:p-12">
        <div className="flex items-center gap-3">
          <LogoMark size={36} />
          <div>
            <div className="text-xl font-bold tracking-tight text-white drop-shadow">LoadTruth</div>
            <div className="text-xs font-medium text-white/80">Developer & SuperAdmin Portal</div>
          </div>
        </div>

        <div className="max-w-md rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <TerminalIcon className="size-4" />
            Developer Console
          </div>
          <h2 className="mt-2 text-lg font-bold text-white">SuperAdmin Administration</h2>
          <p className="mt-2 text-xs leading-relaxed text-white/80">
            This portal is restricted to authorized developers and system owners. Credentials are
            cryptographically verified against SHA-256 hashes configured in the environment.
          </p>
          <div className="mt-4 flex flex-col gap-1.5 text-[11px] text-white/70">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span>Full control to upload and manage Demo Videos</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span>Modify Workspace Settings, AI models, and rate tables</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              <span>Rest of staff have view & pipeline replay permissions</span>
            </div>
          </div>
        </div>

        <div className="text-xs text-white/60">
          LoadTruth Engine · High-Privilege Administration Gate
        </div>
      </div>

      {/* Login form panel */}
      <div className="relative z-10 flex min-h-dvh flex-col items-center justify-center p-6 sm:p-10">
        <div className="absolute right-6 top-6 flex items-center gap-3">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <Card className="p-7 shadow-2xl backdrop-blur-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <ShieldCheckIcon className="size-4" />
                <span>SuperAdmin Access</span>
              </div>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Custom Password
              </span>
            </div>

            <h1 className="mt-3 text-xl font-bold tracking-tight text-foreground">SuperAdmin Sign In</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in with your developer username and custom password.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground" htmlFor="username">
                  Username
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="username"
                    type="text"
                    required
                    autoComplete="username"
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={submitting}
                    placeholder="Enter username"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <div className="relative mt-1.5">
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    placeholder="Enter custom password"
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs font-medium text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={submitting} className="w-full" size="default">
                {submitting ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    Authenticating…
                  </>
                ) : (
                  <>
                    <KeyRoundIcon className="mr-2 size-4" />
                    Sign In as SuperAdmin
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 border-t border-border pt-4 text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeftIcon className="size-3.5" />
                Back to standard workspace login
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

