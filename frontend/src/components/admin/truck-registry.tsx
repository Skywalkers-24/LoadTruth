"use client";

import { useState } from "react";

import { ApiError, type Truck } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TruckIcon } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useTruckMutations, useTrucks } from "@/lib/hooks";
import { cubicYards } from "@/lib/format";

/**
 * Certified-truck registry: list, add (in a modal), and remove (with
 * confirmation). The add form opens in a dialog so the list stays the focus of
 * the page and the form has room to breathe.
 */
export function TruckRegistry() {
  const trucks = useTrucks();
  const { create, remove } = useTruckMutations();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [number, setNumber] = useState("");
  const [body, setBody] = useState("");
  const [cap, setCap] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Truck | null>(null);

  function resetForm() {
    setNumber("");
    setBody("");
    setCap("");
    setSource("");
    setError(null);
  }

  function openAdd() {
    resetForm();
    setAdding(true);
  }

  const canSubmit = number.trim() !== "" && cap.trim() !== "" && !create.isPending;

  function submitAdd() {
    if (!canSubmit) return;
    setError(null);
    const num = number.trim();
    create.mutate(
      {
        truck_number: num,
        body_type: body.trim() || null,
        certified_cubic_yards: cap.trim(),
        registry_source: source.trim() || null,
      },
      {
        onSuccess: () => {
          resetForm();
          setAdding(false);
          toast.push("ok", `Registered truck ${num}.`);
        },
        onError: (err) =>
          setError(
            err instanceof ApiError && err.status === 409
              ? "A truck with that number already exists."
              : "Could not add truck. Check the fields and try again.",
          ),
      },
    );
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
            Trucks with a registered bed capacity. A ticket whose truck is not here reads as
            uncertified.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-[11px] tabular-nums text-[var(--color-subtle)]">
            {trucks.data?.length ?? 0} trucks
          </span>
          <Button variant="primary" size="sm" icon={<TruckIcon size={15} />} onClick={openAdd}>
            Add truck
          </Button>
        </div>
      </div>

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
        <ul className="lt-scroll divide-y divide-[var(--color-border)] overflow-y-auto rounded-lg border border-[var(--color-border)]">
          {trucks.data?.map((t: Truck) => (
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
              <Button
                variant="danger"
                size="sm"
                onClick={() => setRemoving(t)}
                disabled={remove.isPending}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Add-truck modal. ConfirmDialog hosts the form (overlay + focus trap). */}
      <ConfirmDialog
        open={adding}
        title="Add a certified truck"
        description="Register a truck so its loads match to a bed capacity. Truck number must be unique."
        confirmLabel="Add truck"
        busy={create.isPending}
        reason={{ required: true, valid: canSubmit }}
        onConfirm={submitAdd}
        onCancel={() => setAdding(false)}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitAdd();
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
              label="Capacity (CY)"
              value={cap}
              onChange={setCap}
              placeholder="20"
              type="number"
            />
            <Field label="Body type" value={body} onChange={setBody} placeholder="tandem" />
            <Field
              label="Registry source"
              value={source}
              onChange={setSource}
              placeholder="County fleet"
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
            ? `Truck ${removing.truck_number} will be removed from the certified registry. Tickets referencing it will read as uncertified.`
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
