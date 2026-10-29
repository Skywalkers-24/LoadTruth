import type { PipelineProgress } from "@/lib/api";

/** Keep discovering new runs after the previous run has completed. */
export function pipelinePollInterval(run: PipelineProgress | null | undefined, active: boolean) {
  return run?.status === "running" || active ? 1500 : 5000;
}

/** Attempt identity uses server data, so browser clock skew cannot hide a run. */
export function pipelineAttemptKey(run: PipelineProgress) {
  return `${run.event_id}:${run.started_at}`;
}

/** Prevent the cached previous attempt posing as the upload just submitted. */
export function currentPipelineRun(
  run: PipelineProgress | null | undefined,
  ignoredAttempt?: string,
) {
  if (!run || pipelineAttemptKey(run) === ignoredAttempt) return null;
  return run;
}
