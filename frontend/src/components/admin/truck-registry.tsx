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

/** Certified-truck registry admin: list + add + remove (with confirmation). */
export function TruckRegistry() {
  const trucks = useTrucks();
  const { create, remove } = useTruckMutations();
  const toast = useToast();
  const [number, setNumber] = useState("");
  const [body, setBody] = useState("");
  const [cap, setCap] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Truck | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    create.mutate(
      {
        truck_number: number.trim(),
        body_type: body.trim() || null,
        certified_cubic_yards: cap.trim(),
      },
      {
        onSuccess: () => {
          setNumber("");
          setBody("");
          setCap("");
          toast.push("ok", `Registered truck ${number.trim()}.`);
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
        toast.push("danger", "Couldn’t remove the truck.");
        setRemoving(null);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add form — bordered card with labeled grid inputs */}
      <form
        onSubmit={add}
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4"
      >
        <div className="mb-3 text-[12px] font-semibold text-[var(--color-text)]">
          Register a certified truck
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end">
          <Field label="Truck number" value={number} onChange={setNumber} placeholder="FL-DT-0001" />
          <Field label="Body type" value={body} onChange={setBody} placeholder="tandem" />
          <Field label="Capacity (CY)" value={cap} onChange={setCap} placeholder="20" type="number" />
          <Button
            type="submit"
            variant="primary"
            icon={<TruckIcon size={15} />}
            disabled={create.isPending || !number.trim() || !cap.trim()}
          >
            Add truck
          </Button>
        </div>
        {error && <p className="mt-2 text-[12px] text-[var(--color-danger)]">{error}</p>}
      </form>

      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-[var(--color-text)]">
          Certified fleet
        </span>
        <span className="text-[11px] tabular-nums text-[var(--color-subtle)]">
          {trucks.data?.length ?? 0} trucks
        </span>
      </div>

      {trucks.isLoading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (trucks.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<TruckIcon size={20} />}
          title="No trucks registered"
          description="Tickets referencing an unregistered truck are flagged as uncertified."
        />
      ) : (
        <ul className="lt-scroll max-h-[420px] divide-y divide-[var(--color-border)] overflow-y-auto rounded-lg border border-[var(--color-border)]">
          {trucks.data?.map((t: Truck) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-2)]"
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-subtle)]"
                  aria-hidden
                >
                  <TruckIcon size={15} />
                </span>
                <span className="flex flex-col">
                  <span className="text-[13px] font-medium tabular-nums text-[var(--color-text)]">
                    {t.truck_number}
                  </span>
                  <span className="text-[11px] text-[var(--color-muted)]">
                    {t.body_type ?? "—"} · {cubicYards(t.certified_cubic_yards)}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-[var(--color-muted)]">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </label>
  );
}
