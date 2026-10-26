/**
 * Thin typed client for the FastAPI backend. During local dev, requests go
 * through the Next.js rewrite in `next.config.ts` (`/api/*` -> backend).
 */

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export interface Health {
  status: string;
  environment: string;
  model_api_configured: boolean;
}

/** Returns backend health, or null if the backend is unreachable. */
export async function getHealth(): Promise<Health | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as Health;
  } catch {
    return null;
  }
}
