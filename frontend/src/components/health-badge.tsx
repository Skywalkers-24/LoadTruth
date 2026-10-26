import { getHealth } from "@/lib/api";

/**
 * Server Component: fetches backend health at request time. Degrades gracefully
 * when the backend is offline (the common case before `scripts/dev.sh` runs).
 */
export async function HealthBadge() {
  const health = await getHealth();

  if (!health) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Backend not reachable yet — start it with{" "}
        <code className="rounded bg-[var(--color-bg)] px-1.5 py-0.5">./scripts/dev.sh</code>.
      </p>
    );
  }

  const ready = health.model_api_configured;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="inline-flex items-center gap-2">
        <span className="size-2 rounded-full bg-[var(--color-ok)]" aria-hidden />
        API up ({health.environment})
      </span>
      <span className="inline-flex items-center gap-2">
        <span
          className={`size-2 rounded-full ${ready ? "bg-[var(--color-ok)]" : "bg-[var(--color-warn)]"}`}
          aria-hidden
        />
        Meta Model API {ready ? "configured" : "key not set"}
      </span>
    </div>
  );
}
