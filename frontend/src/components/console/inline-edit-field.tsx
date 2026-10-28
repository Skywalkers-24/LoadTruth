"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** One selectable option for the select variant. */
export interface EditOption {
  value: string;
  label: string;
}

/**
 * An inline-editable field: shows a value with a small edit affordance, and on
 * click swaps to a text input or a select. Enter (or the check) saves, Esc (or
 * the X) cancels. Used for ticket fields like the truck ID and debris class so
 * an operator can correct them in place without leaving the review console.
 *
 * Saving is delegated to `onSave`, which returns a promise; the control shows a
 * busy state until it resolves and stays open on failure so the edit isn't lost.
 */
export function InlineEditField({
  value,
  display,
  options,
  placeholder,
  ariaLabel,
  warn = false,
  canEdit = true,
  onSave,
}: {
  /** Current raw value (empty string when unset). */
  value: string;
  /** How to render the value when not editing. Defaults to the raw value. */
  display?: ReactNode;
  /** When given, edit as a select over these options; otherwise a text input. */
  options?: EditOption[];
  placeholder?: string;
  ariaLabel: string;
  /** Style the resting value as a warning (e.g. an unidentified truck). */
  warn?: boolean;
  canEdit?: boolean;
  onSave: (next: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  // Reseed the draft whenever we open or the source value changes under us.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = options ? selectRef.current : inputRef.current;
    el?.focus();
    if (!options) inputRef.current?.select();
  }, [editing, options]);

  async function commit() {
    const next = draft.trim();
    if (next === value.trim()) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (!canEdit) {
    return (
      <span
        className="truncate text-[13px] font-medium tabular-nums"
        style={{ color: warn ? "var(--color-warn)" : "var(--color-text)" }}
      >
        {display ?? value}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${ariaLabel}`}
        className="group flex min-w-0 items-center gap-1.5 text-left"
      >
        <span
          className="truncate text-[13px] font-medium tabular-nums group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-2"
          style={{ color: warn ? "var(--color-warn)" : "var(--color-text)" }}
        >
          {display ?? value}
        </span>
        <PencilIcon
          className="size-3 shrink-0 text-[var(--color-subtle)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          aria-hidden
        />
      </button>
    );
  }

  const control = options ? (
    <select
      ref={selectRef}
      value={draft}
      disabled={busy}
      onChange={(e) => setDraft(e.target.value)}
      aria-label={ariaLabel}
      className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[13px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ) : (
    <input
      ref={inputRef}
      value={draft}
      disabled={busy}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      className="min-w-0 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-[13px] tabular-nums text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
    />
  );

  return (
    <span className="flex min-w-0 items-center gap-1">
      {control}
      <button
        type="button"
        onClick={() => void commit()}
        disabled={busy}
        aria-label="Save"
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-md text-[var(--color-ok)] hover:bg-[var(--color-surface-2)] disabled:opacity-40",
        )}
      >
        <CheckIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={cancel}
        disabled={busy}
        aria-label="Cancel"
        className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--color-subtle)] hover:bg-[var(--color-surface-2)] disabled:opacity-40"
      >
        <XIcon className="size-3.5" />
      </button>
    </span>
  );
}
