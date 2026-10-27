"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import {
  type Capabilities,
  type Member,
  getAuthToken,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  setAuthToken,
} from "@/lib/api";

interface AuthValue {
  member: Member | null;
  loading: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (capability: keyof Capabilities) => boolean;
}

const AuthCtx = createContext<AuthValue | null>(null);

/**
 * App authentication. On mount, if a session token is stored, it refreshes the
 * member from the server (so a role change takes effect without re-login). The
 * `can(...)` helper reads the server-provided capability map, so the UI hides or
 * disables exactly what the backend would reject.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    getMe()
      .then((m) => {
        if (active) setMember(m);
      })
      .catch(() => {
        setAuthToken(null);
        if (active) setMember(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (email: string) => {
    const result = await apiLogin(email);
    setAuthToken(result.token);
    setMember(result.member);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* token may already be invalid; clear locally regardless */
    }
    setAuthToken(null);
    setMember(null);
  }, []);

  const can = useCallback(
    (capability: keyof Capabilities) => member?.capabilities?.[capability] ?? false,
    [member],
  );

  const value = useMemo<AuthValue>(
    () => ({ member, loading, signIn, signOut, can }),
    [member, loading, signIn, signOut, can],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
