"use client";

import { useState } from "react";

import { PencilIcon } from "lucide-react";

import { ApiError, type Truck, type TruckInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TruckIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { Pagination } from "@/components/pagination";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth";
import { useEventContext } from "@/lib/event-context";
import { useTruckMutations, useTrucks } from "@/lib/hooks";
import { cubicYards } from "@/lib/format";

const TRUCK_PAGE_SIZE = 10;
const BODY_TYPE_OPTIONS = [
  { value: "tandem", label: "Tandem" },
  { value: "walking-floor", label: "Walking floor" },
  { value: "roll-off", label: "Roll-off" },
] as const;

/**
 * Certified-truck registry: list, add, edit, and remove certified trucks. Add
 * and edit share one modal (overlay + focus trap via ConfirmDialog); remove uses
 * a separate confirmation modal because it is destructive.
 */
export function TruckRegistry() {
  const trucks = useTrucks();
  const { create, update, remove } = useTruckMutations();
  const toast = useToast();
  const { can } = useAuth();
  const { selected } = useEventContext();
  const isReadOnly = Boolean(selected?.tags.includes("read-only"));
  const canManage = can("manage_trucks") && !isReadOnly;
  // `editing` null = closed; a Truck = edit that truck; "new" = add a truck.
  const [editing, setEditing] = useState<Truck | "new" | null>(null);
  const [number, setNumber] = useState("");
  const [body, setBody] = useState("");
  const [cap, setCap] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Truck | null>(null);
  const [offset, setOffset] = useState(0);

  const isEdit = editing !== null && editing !== "new";
  const saving = create.isPending || update.isPending;

  const allTrucks = trucks.data ?? [];
  const total = allTrucks.length;
  const clampedOffset = offset >= total ? 0 : offset;
  const pageTrucks = allTrucks.slice(clampedOffset, clampedOffset + TRUCK_PAGE_SIZE);

  function openAdd() {
    setNumber("");
    setBody("");
    setCap("");
    setSource("");
    setError(null);
    setEditing("new");
  }

  function openEdit(t: Truck) {
    setNumber(t.truck_number);
    setBody(t.body_type ?? "");
    setCap(t.certified_cubic_yards);
    setSource(t.registry_source ?? "");
    setError(null);
    setEditing(t);
  }

  const canSubmit = number.trim() !== "" && cap.trim() !== "" && !saving;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    const num = number.trim();
    const payload: TruckInput = {
      truck_number: num,
      body_type: body.trim() || null,
      certified_cubic_yards: cap.trim(),
      registry_source: source.trim() || null,
    };
    const onError = (err: unknown) =>
      setError(
        err instanceof ApiError && err.status === 409
          ? "A truck with that number already exists."
          : "Could not save the truck. Check the fields and try again.",
      );

    if (isEdit) {
      const t = editing as Truck;
      update.mutate(
        { id: t.id, body: payload },
        {
          onSuccess: () => {
            setEditing(null);
            toast.push("ok", `Updated truck ${num}.`);
          },
          onError,
        },
      );
    } else {
      create.mutate(payload, {
        onSuccess: () => {
          setEditing(null);
          toast.push("ok", `Registered truck ${num}.`);
        },
        onError,
      });
    }
  }

  function confirmRemove() {
    if (!removing) return;
    const t = removing;
    remove.mutate(t.id, {
      onSuccess: () => {
        toast.push("ok", `Removed truck ${t.truck_number}.`);
        setRemoving(null);
      },
      onError: () => {
        toast.push("danger", "Could not remove the truck.");
        setRemoving(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-[var(--color-text)]">
            Certified fleet
          </span>
          <span className="text-[12px] text-[var(--color-muted-foreground)]">
            Registered truck IDs and certified bed capacities used for new load calculations. Demo
            specification sources are shown on each entry.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--color-subtle)]">
            {trucks.data?.length ?? 0} trucks
          </span>
          {canManage && (
            <Button variant="primary" size="sm" icon={<TruckIcon size={15} />} onClick={openAdd}>
              Add truck
            </Button>
          )}
        </div>
      </div>

      {isReadOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Read-only event:</span> Certified truck
          registry is locked and cannot be modified in benchmark or archive mode.
        </div>
      )}

      {trucks.isLoading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (trucks.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<TruckIcon size={20} />}
          title="No trucks registered"
          description="Add your certified trucks so loads can be matched to a bed capacity."
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {pageTrucks.map((t: Truck) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-subtle)]"
                  aria-hidden
                >
                  <TruckIcon size={15} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[13px] font-medium tabular-nums text-[var(--color-text)]">
                    {t.truck_number}
                  </span>
                  <span className="truncate text-[11px] text-[var(--color-muted-foreground)]">
                    {t.body_type ?? "Body type not set"} · {cubicYards(t.certified_cubic_yards)}
                    {t.registry_source ? ` · ${t.registry_source}` : ""}
                  </span>
                </span>
              </span>
              {canManage && (
                <span className="flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<PencilIcon size={14} />}
                    onClick={() => openEdit(t)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setRemoving(t)}
                    disabled={remove.isPending}
                  >
                    Remove
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {total > TRUCK_PAGE_SIZE && (
        <Pagination
          total={total}
          limit={TRUCK_PAGE_SIZE}
          offset={clampedOffset}
          onOffset={setOffset}
        />
      )}

      {/* Add / edit modal. ConfirmDialog hosts the form (overlay + focus trap). */}
      <ConfirmDialog
        open={editing !== null}
        title={isEdit ? "Edit truck" : "Add a certified truck"}
        description={
          isEdit
            ? "Update the truck ID, body type, certified capacity, or source. Changes apply to future calculations; existing tickets keep their saved values."
            : "Enter the unique placard ID, body type, certified bed capacity in cubic yards, and certification source. For demo footage, identify the demo specification as the source."
        }
        confirmLabel={isEdit ? "Save changes" : "Add truck"}
        busy={saving}
        reason={{ required: true, valid: canSubmit }}
        onConfirm={submit}
        onCancel={() => setEditing(null)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Truck number"
              value={number}
              onChange={setNumber}
              placeholder="FL-DT-0001"
              autoFocus
            />
            <Field
              label="Certified bed capacity (CY)"
              value={cap}
              onChange={setCap}
              placeholder="20"
              type="number"
            />
            <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-foreground)]">
              Body type
              <select
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="">Select a body type</option>
                {body && !BODY_TYPE_OPTIONS.some((option) => option.value === body) && (
                  <option value={body}>{body} (existing)</option>
                )}
                {BODY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Certification source"
              value={source}
              onChange={setSource}
              placeholder="County certificate or demo specification"
            />
          </div>
          {error && <p className="text-[12px] text-[var(--color-danger)]">{error}</p>}
          {/* Submit on Enter without a visible button; the dialog footer confirms. */}
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </ConfirmDialog>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this truck?"
        description={
          removing
            ? `Truck ${removing.truck_number} will be removed from the registry for future calculations. Existing tickets keep their saved certification and values.`
            : ""
        }
        confirmLabel="Remove"
        confirmVariant="danger"
        busy={remove.isPending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted-foreground)]">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- focus the first field when the modal opens
        autoFocus={autoFocus}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </label>
  );
}
