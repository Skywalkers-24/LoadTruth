"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api";

/** App-wide TanStack Query provider. One client per browser session. */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            // Retry on transient network errors or Render free-tier cold-starts (502/503/504)
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status === 401) return false;
              if (error instanceof ApiError && error.status === 404) return false;
              return failureCount < 6;
            },
            retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
