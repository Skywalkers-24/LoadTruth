"use client";

import { useState } from "react";

import { ApiError, type Truck } from "@/lib/api";
import { useTruckMutations, useTrucks } from "@/lib/hooks";
import { cubicYards } from "@/lib/format";

/** Certified-truck registry admin: list + add + delete. */
export function TruckRegistry() {
  const trucks = useTrucks();
  const { create, remove } = useTruckMutations();
  const [number, setNumber] = useState("");
  const [body, setBody] = useState("");
  const [cap, setCap] = useState("");
  const [error, setError] = useState<string | null>(null);

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
        },
        onError: (err) =>
          setError(
            err instanceof ApiError && err.status === 409
              ? "A truck with that number already exists."
              : "Could not add truck — check the fields.",
          ),
      },
    );
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-4 text-sm font-semibold">Certified-truck registry</h2>

      <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-2">
        <Field label="Truck number" value={number} onChange={setNumber} placeholder="FL-DT-0001" />
        <Field
          label="Body type"
          value={body}
          onChange={setBody}
          placeholder="tandem"
          required={false}
        />
        <Field label="Capacity (CY)" value={cap} onChange={setCap} placeholder="20" type="number" />
        <button
          type="submit"
          disabled={create.isPending || !number.trim() || !cap.trim()}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          Add truck
        </button>
      </form>
      {error && <p className="mb-3 text-xs text-[var(--color-danger)]">{error}</p>}

      {trucks.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (trucks.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No trucks registered.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {trucks.data?.map((t: Truck) => (
            <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="flex flex-col">
                <span className="font-medium tabular-nums">{t.truck_number}</span>
                <span className="text-xs text-[var(--color-muted)]">
                  {t.body_type ?? "—"} · {cubicYards(t.certified_cubic_yards)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove.mutate(t.id)}
                disabled={remove.isPending}
                className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-danger)] hover:border-[var(--color-danger)] disabled:opacity-40"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
      {label}
      {!required && <span className="sr-only">(optional)</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      />
    </label>
  );
}
