"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  type Capabilities,
  type Member,
  getAuthToken,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  setAuthToken,
  superadminLogin as apiSuperadminLogin,
} from "@/lib/api";

interface AuthValue {
  member: Member | null;
  loading: boolean;
  signIn: (email: string) => Promise<void>;
  superAdminSignIn: (username: string, password: string) => Promise<void>;
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
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    return Boolean(getAuthToken());
  });

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

  const queryClient = useQueryClient();

  const signIn = useCallback(
    async (email: string) => {
      const result = await apiLogin(email);
      setAuthToken(result.token);
      setMember(result.member);
      // Invalidate and refetch all tenant queries fresh with the new session
      await queryClient.resetQueries();
    },
    [queryClient],
  );

  const superAdminSignIn = useCallback(
    async (username: string, password: string) => {
      const result = await apiSuperadminLogin(username, password);
      setAuthToken(result.token);
      setMember(result.member);
      await queryClient.resetQueries();
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      /* token may already be invalid; clear locally regardless */
    }
    setAuthToken(null);
    setMember(null);
    queryClient.clear();
  }, [queryClient]);

  const can = useCallback(
    (capability: keyof Capabilities) => member?.capabilities?.[capability] ?? false,
    [member],
  );

  const value = useMemo<AuthValue>(
    () => ({ member, loading, signIn, superAdminSignIn, signOut, can }),
    [member, loading, signIn, superAdminSignIn, signOut, can],
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
