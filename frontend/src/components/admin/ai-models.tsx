"use client";

import { useEffect, useMemo, useState } from "react";

import {
  type AiConfigResponse,
  type CostMode,
  type ModelInfo,
  type ReasoningEffort,
  type TaskConfig,
  type TaskInfo,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { ErrorState, Skeleton } from "@/components/ui/primitives";
import { useAuth } from "@/lib/auth";
import { useAiConfig, useUpdateAiConfig } from "@/lib/hooks";

const EFFORT_LABEL: Record<ReasoningEffort, string> = {
  minimal: "Minimal",
  low: "Low",
  balanced: "Balanced",
  high: "High",
  max: "Max",
};

const EFFORT_BLURB: Record<ReasoningEffort, string> = {
  minimal: "Fastest and cheapest. Little to no deliberation.",
  low: "Light reasoning for simple, high-volume calls.",
  balanced: "A sensible middle ground for most tasks.",
  high: "More thinking for harder problems. Costs more.",
  max: "Maximum deliberation. Highest capability and spend.",
};

const COST_MODE_LABEL: Record<CostMode, string> = {
  standard: "Standard",
  contributor: "Contributor (discounted)",
};

/** A rough, relative "spend" indicator so admins can see the cost impact of a pick. */
function spendWeight(model: ModelInfo, effort: ReasoningEffort): number {
  const out = model.pricing?.output ?? 0;
  const effortMult: Record<ReasoningEffort, number> = {
    minimal: 0.5,
    low: 0.8,
    balanced: 1,
    high: 1.6,
    max: 2.4,
  };
  return out * effortMult[effort];
}

function spendBadge(weight: number): { tone: "ok" | "warn" | "danger"; label: string } {
  if (weight <= 2) return { tone: "ok", label: "Low cost" };
  if (weight <= 8) return { tone: "warn", label: "Moderate cost" };
  return { tone: "danger", label: "High cost" };
}

function priceLine(model: ModelInfo): string {
  const p = model.pricing;
  if (!p)
    return model.provider && model.provider !== "meta"
      ? "Provider pricing not configured; charges may apply."
      : "Self-hosted or subscription, no per-token price.";
  if (p.unit === "per_1k_images") return `$${p.output?.toFixed(2)} per 1,000 images`;
  if (p.unit === "per_image") return `$${p.output?.toFixed(2)} per image`;
  if (p.unit === "per_hour") return `$${p.output?.toFixed(2)} per hour of audio`;
  const parts: string[] = [];
  if (p.input != null) parts.push(`in $${p.input.toFixed(2)}`);
  if (p.cached_input != null) parts.push(`cached $${p.cached_input.toFixed(3)}`);
  if (p.output != null) parts.push(`out $${p.output.toFixed(2)}`);
  return `${parts.join(" · ")} per 1M tokens`;
}

/** The editable draft for one task row. */
type Draft = { model: string; effort: ReasoningEffort; costMode: CostMode };

function draftFromConfig(task: TaskInfo, cfg: TaskConfig | undefined): Draft {
  return {
    model: cfg?.model ?? task.default_model,
    effort: cfg?.effort ?? task.default_effort,
    costMode: cfg?.cost_mode ?? task.default_cost_mode,
  };
}

function draftsFromData(data: AiConfigResponse): Record<string, Draft> {
  const out: Record<string, Draft> = {};
  for (const task of data.catalog.tasks) {
    out[task.id] = draftFromConfig(
      task,
      data.config.find((c) => c.task_id === task.id),
    );
  }
  return out;
}

export function AiModelsPanel() {
  const { data, isLoading, isError, refetch } = useAiConfig();
  const { can, member } = useAuth();
  const canEdit = member?.role === "super_admin" || Boolean(can("manage_settings"));
  const toast = useToast();
  const { update, reset } = useUpdateAiConfig();
  const [confirming, setConfirming] = useState(false);
  // One draft per task, lifted here so a single "Save all" can apply them
  // together. Reseeded whenever the server config changes.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  useEffect(() => {
    if (data) setDrafts(draftsFromData(data));
  }, [data]);

  if (isError) {
    return (
      <ErrorState
        title="AI settings unavailable"
        description="The server did not return the model catalog."
        onRetry={() => void refetch()}
      />
    );
  }
  if (isLoading || !data || Object.keys(drafts).length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  const config = data.config;
  const setDraft = (taskId: string, next: Draft) => setDrafts((d) => ({ ...d, [taskId]: next }));

  // Which tasks changed from what the server currently has.
  const dirtyTasks = data.catalog.tasks.filter((task) => {
    const d = drafts[task.id];
    const cur = config.find((c) => c.task_id === task.id);
    if (!d) return false;
    const base = draftFromConfig(task, cur);
    return d.model !== base.model || d.effort !== base.effort || d.costMode !== base.costMode;
  });
  const dirtyCount = dirtyTasks.length;

  async function saveAll() {
    const results = await Promise.allSettled(
      dirtyTasks.map((task) => {
        const d = drafts[task.id]!;
        return update.mutateAsync({
          taskId: task.id,
          body: { model: d.model, effort: d.effort, cost_mode: d.costMode },
        });
      }),
    );
    setConfirming(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      toast.push("ok", dirtyCount === 1 ? "1 task updated." : `${dirtyCount} tasks updated.`);
    } else {
      toast.push("danger", `${failed} of ${dirtyCount} tasks did not save. Please retry.`);
    }
  }

  function resetAllToDefault() {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const task of data!.catalog.tasks) {
        next[task.id] = {
          model: task.default_model,
          effort: task.default_effort,
          costMode: task.default_cost_mode,
        };
      }
      return next;
    });
  }

  function discard() {
    setDrafts(draftsFromData(data!));
  }

  const busy = update.isPending || reset.isPending;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <p className="text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        Choose which model powers each step of the pipeline and how hard it reasons. Lower effort
        and the discounted Contributor mode save money; higher effort and Muse Wonder cost more but
        handle harder cases. Changes apply to work processed after you save.
      </p>

      {/* Sticky action bar: one Save all for every edited task. */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <Button
          variant="primary"
          size="sm"
          disabled={!canEdit || dirtyCount === 0 || busy}
          onClick={() => setConfirming(true)}
        >
          {dirtyCount > 1 ? `Save all (${dirtyCount})` : "Save all"}
        </Button>
        <Button variant="ghost" size="sm" disabled={!canEdit || dirtyCount === 0 || busy} onClick={discard}>
          Discard changes
        </Button>
        <Button variant="ghost" size="sm" disabled={!canEdit || busy} onClick={resetAllToDefault}>
          Reset all to default
        </Button>
        <span className="ml-auto text-[12px] text-[var(--color-muted-foreground)]">
          {!canEdit
            ? "SuperAdmin required to change AI models"
            : dirtyCount === 0
              ? "All saved"
              : dirtyCount === 1
                ? "1 task has unsaved changes"
                : `${dirtyCount} tasks have unsaved changes`}
        </span>
      </div>

      {data.catalog.tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          data={data}
          draft={drafts[task.id]!}
          onChange={(next) => setDraft(task.id, next)}
        />
      ))}

      <ConfirmDialog
        open={confirming}
        title={dirtyCount === 1 ? "Save this change?" : `Save ${dirtyCount} changes?`}
        description="New work runs on the selected models and effort. Cost per run changes accordingly; in-flight work is unaffected."
        confirmLabel="Save all"
        busy={update.isPending}
        onConfirm={() => void saveAll()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function TaskCard({
  task,
  data,
  draft,
  onChange,
}: {
  task: TaskInfo;
  data: AiConfigResponse;
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  const current = data.config.find((c) => c.task_id === task.id);
  const { model, effort, costMode } = draft;

  const eligible = useMemo(
    () => data.catalog.models.filter((m) => task.eligible_models.includes(m.id)),
    [data.catalog.models, task.eligible_models],
  );
  const selected = eligible.find((m) => m.id === model) ?? eligible[0];

  // Keep effort/cost mode valid for the chosen model.
  const availableEfforts = selected?.efforts ?? [];
  const availableModes = selected?.cost_modes ?? ["standard"];

  const base = draftFromConfig(task, current);
  const dirty = model !== base.model || effort !== base.effort || costMode !== base.costMode;
  const isDefault =
    model === task.default_model &&
    effort === task.default_effort &&
    costMode === task.default_cost_mode;

  const weight = selected ? spendWeight(selected, effort) : 0;
  const badge = spendBadge(weight);

  function setModel(id: string) {
    const next = eligible.find((m) => m.id === id);
    let ef = effort;
    let cm = costMode;
    if (next) {
      if (task.supports_effort && next.efforts.length && !next.efforts.includes(effort)) {
        ef = next.efforts.includes("balanced") ? "balanced" : next.efforts[0]!;
      }
      if (!next.cost_modes.includes(costMode)) cm = next.cost_modes[0]!;
    }
    onChange({ model: id, effort: ef, costMode: cm });
  }
  const setEffort = (ef: ReasoningEffort) => onChange({ ...draft, effort: ef });
  const setCostMode = (cm: CostMode) => onChange({ ...draft, costMode: cm });
  const resetThis = () =>
    onChange({
      model: task.default_model,
      effort: task.default_effort,
      costMode: task.default_cost_mode,
    });

  const selectClass =
    "rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none";

  return (
    <div className="rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[var(--color-text)]">{task.name}</h3>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {!isDefault && <Badge tone="neutral">Customized</Badge>}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            {task.description}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--color-subtle)]">Model</span>
          <select
            className={selectClass}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            aria-label={`${task.name} model`}
          >
            {eligible.map((m) => (
              <option key={m.id} value={m.id} disabled={!m.available}>
                {m.name}
                {m.premium ? " ★" : ""}
                {!m.available ? " · Not configured" : ""}
              </option>
            ))}
          </select>
          {selected && (
            <span className="text-[11px] text-[var(--color-subtle)]">{priceLine(selected)}</span>
          )}
        </label>

        {task.supports_effort && availableEfforts.length > 0 ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[var(--color-subtle)]">
              Reasoning effort
            </span>
            <select
              className={selectClass}
              value={effort}
              onChange={(e) => setEffort(e.target.value as ReasoningEffort)}
              aria-label={`${task.name} reasoning effort`}
            >
              {availableEfforts.map((ef) => (
                <option key={ef} value={ef}>
                  {EFFORT_LABEL[ef]}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-[var(--color-subtle)]">{EFFORT_BLURB[effort]}</span>
          </label>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-[var(--color-subtle)]">
              Reasoning effort
            </span>
            <span className="text-[12px] text-[var(--color-muted-foreground)]">
              Not applicable for this model.
            </span>
          </div>
        )}
      </div>

      {availableModes.length > 1 && (
        <label className="mt-4 flex max-w-xs flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--color-subtle)]">Cost mode</span>
          <select
            className={selectClass}
            value={costMode}
            onChange={(e) => setCostMode(e.target.value as CostMode)}
            aria-label={`${task.name} cost mode`}
          >
            {availableModes.map((cm) => (
              <option key={cm} value={cm}>
                {COST_MODE_LABEL[cm]}
              </option>
            ))}
          </select>
          {costMode === "contributor" && (
            <span className="text-[11px] text-[var(--color-warn)]">
              Discounted, but Meta may use this task’s content to train future models.
            </span>
          )}
        </label>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" disabled={isDefault} onClick={resetThis}>
          Reset to default
        </Button>
        {dirty && <span className="text-[12px] text-[var(--color-warn)]">Unsaved changes</span>}
      </div>
    </div>
  );
}
