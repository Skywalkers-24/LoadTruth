/**
 * Runtime app mode, read from the public env var `NEXT_PUBLIC_APP_MODE`.
 *
 *  - "default": the normal signed-in operator console.
 *  - "judge":   the console opens on a pinned, pre-cached ticket (the $43.20
 *               truck) so a judge sees a finished result first, with a "Run live"
 *               action that re-ingests the same clip through the real pipeline.
 *
 * A single public env var drives this so a judge build needs no code change. The
 * pinned ticket id is also configurable so the demo can point at whichever
 * seeded ticket tells the best story.
 */

export type AppMode = "default" | "judge";

export function appMode(): AppMode {
  return process.env.NEXT_PUBLIC_APP_MODE === "judge" ? "judge" : "default";
}

export function isJudgeMode(): boolean {
  return appMode() === "judge";
}

/**
 * An explicit ticket id to pin judge mode to, or null. When null (the default),
 * the console picks the highest flagged dollar-delta ticket at runtime (the
 * headline over-call), which is stable regardless of the seed's random ids.
 * Set `NEXT_PUBLIC_JUDGE_TICKET_ID` to pin a specific ticket instead.
 */
export function judgeTicketId(): string | null {
  return process.env.NEXT_PUBLIC_JUDGE_TICKET_ID?.trim() || null;
}
