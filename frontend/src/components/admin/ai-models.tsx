"use client";

import { useMemo, useState } from "react";

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
  if (!p) return "Self-hosted / subscription — no per-token price.";
  if (p.unit === "per_1k_images") return `$${p.output?.toFixed(2)} per 1,000 images`;
  if (p.unit === "per_image") return `$${p.output?.toFixed(2)} per image`;
  if (p.unit === "per_hour") return `$${p.output?.toFixed(2)} per hour of audio`;
  const parts: string[] = [];
  if (p.input != null) parts.push(`in $${p.input.toFixed(2)}`);
  if (p.cached_input != null) parts.push(`cached $${p.cached_input.toFixed(3)}`);
  if (p.output != null) parts.push(`out $${p.output.toFixed(2)}`);
  return `${parts.join(" · ")} per 1M tokens`;
}

export function AiModelsPanel() {
  const { data, isLoading, isError, refetch } = useAiConfig();

  if (isError) {
    return (
      <ErrorState
        title="AI settings unavailable"
        description="The server did not return the model catalog."
        onRetry={() => void refetch()}
      />
    );
  }
  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <p className="text-[13px] leading-relaxed text-[var(--color-muted-foreground)]">
        Choose which model powers each step of the pipeline and how hard it reasons. Lower effort and
        the discounted Contributor mode save money; higher effort and Muse Wonder cost more but handle
        harder cases. Changes apply to work processed after you save.
      </p>
      {data.catalog.tasks.map((task) => (
        <TaskCard key={task.id} task={task} data={data} />
      ))}
    </div>
  );
}

function TaskCard({ task, data }: { task: TaskInfo; data: AiConfigResponse }) {
  const toast = useToast();
  const { update, reset } = useUpdateAiConfig();
  const current = data.config.find((c) => c.task_id === task.id);

  const [model, setModel] = useState<string>(current?.model ?? task.default_model);
  const [effort, setEffort] = useState<ReasoningEffort>(current?.effort ?? task.default_effort);
  const [costMode, setCostMode] = useState<CostMode>(current?.cost_mode ?? task.default_cost_mode);
  const [confirming, setConfirming] = useState(false);

  const eligible = useMemo(
    () => data.catalog.models.filter((m) => task.eligible_models.includes(m.id)),
    [data.catalog.models, task.eligible_models],
  );
  const selected = eligible.find((m) => m.id === model) ?? eligible[0];

  // Keep effort/cost mode valid for the chosen model.
  const availableEfforts = selected?.efforts ?? [];
  const availableModes = selected?.cost_modes ?? ["standard"];
  const effortValid = !task.supports_effort || availableEfforts.includes(effort);
  const modeValid = availableModes.includes(costMode);

  const dirty =
    model !== current?.model || effort !== current?.effort || costMode !== current?.cost_mode;
  const isDefault =
    model === task.default_model &&
    effort === task.default_effort &&
    costMode === task.default_cost_mode;

  const weight = selected ? spendWeight(selected, effort) : 0;
  const badge = spendBadge(weight);

  function onModelChange(id: string) {
    setModel(id);
    const next = eligible.find((m) => m.id === id);
    if (next) {
      if (task.supports_effort && next.efforts.length && !next.efforts.includes(effort)) {
        setEffort(next.efforts.includes("balanced") ? "balanced" : next.efforts[0]!);
      }
      if (!next.cost_modes.includes(costMode)) setCostMode(next.cost_modes[0]!);
    }
  }

  function save() {
    update.mutate(
      { taskId: task.id, body: { model, effort, cost_mode: costMode } },
      {
        onSuccess: () => {
          toast.push("ok", `${task.name} updated.`);
          setConfirming(false);
        },
        onError: (e) => {
          toast.push("danger", `Couldn’t save ${task.name}: ${(e as Error).message}`);
          setConfirming(false);
        },
      },
    );
  }

  function onReset() {
    reset.mutate(task.id, {
      onSuccess: (c: TaskConfig) => {
        setModel(c.model);
        setEffort(c.effort);
        setCostMode(c.cost_mode);
        toast.push("ok", `${task.name} reset to the recommended default.`);
      },
      onError: () => toast.push("danger", `Couldn’t reset ${task.name}.`),
    });
  }

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
            onChange={(e) => onModelChange(e.target.value)}
            aria-label={`${task.name} model`}
          >
            {eligible.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.premium ? " ★" : ""}
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
        <Button
          variant="primary"
          size="sm"
          disabled={!dirty || !effortValid || !modeValid || update.isPending}
          onClick={() => setConfirming(true)}
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" disabled={isDefault || reset.isPending} onClick={onReset}>
          Reset to default
        </Button>
        {dirty && <span className="text-[12px] text-[var(--color-warn)]">Unsaved changes</span>}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`Update ${task.name}?`}
        description="New work runs on the selected model and effort. Cost per run changes accordingly; in-flight work is unaffected."
        confirmLabel="Save"
        busy={update.isPending}
        onConfirm={save}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
