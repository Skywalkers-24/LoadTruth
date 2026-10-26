import { HealthBadge } from "@/components/health-badge";

/**
 * Landing / status screen. Mobile-first: content column is fluid and padded,
 * capped on wide desktop. Replaced by the authed app shell as screens land.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-8 px-5 py-12 sm:px-8 sm:py-20">
      <header className="flex flex-col gap-2">
        <span className="text-sm font-medium uppercase tracking-widest text-[var(--color-muted)]">
          LoadTruth
        </span>
        <h1 className="text-balance text-3xl font-semibold sm:text-4xl">
          Video-verified load tickets for hauling paid by the cubic yard.
        </h1>
        <p className="max-w-prose text-[var(--color-muted)]">
          A phone or pole camera at the tower becomes a verified, auditable load ticket — with
          evidence frames a human confirms. Operator console coming online.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-3 text-sm font-medium text-[var(--color-muted)]">Backend status</h2>
        <HealthBadge />
      </section>

      <a
        href="/console"
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-black transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      >
        Open operator console →
      </a>
    </main>
  );
}
