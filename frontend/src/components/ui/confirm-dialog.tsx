"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

/**
 * Accessible confirmation dialog for consequential actions. Escape cancels;
 * Enter confirms when no reason is required, Cmd/Ctrl+Enter confirms when it is.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "primary",
  busy = false,
  reason,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  confirmVariant?: "primary" | "ok" | "warn" | "danger";
  busy?: boolean;
  reason?: { required: boolean; valid: boolean };
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const confirmDisabled = busy || (reason?.required ? !reason.valid : false);

  useEffect(() => {
    if (!open) return;
    if (!reason?.required) confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter" && !confirmDisabled && (!reason?.required || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onConfirm();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm, confirmDisabled, reason?.required]);

  if (!open) return null;

  const accent =
    confirmVariant === "ok"
      ? "var(--color-ok)"
      : confirmVariant === "warn"
        ? "var(--color-warn)"
        : confirmVariant === "danger"
          ? "var(--color-danger)"
          : "var(--color-accent)";

  return (
    <div
      className="lt-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="lt-pop-in w-full max-w-md overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      >
        <div className="h-1 w-full" style={{ backgroundColor: accent }} aria-hidden />
        <div className="p-5">
          <h2 className="text-[16px] font-semibold text-[var(--color-text)]">{title}</h2>
          {description && <p className="mt-1.5 text-[13px] text-[var(--color-muted)]">{description}</p>}
          {children && <div className="mt-4">{children}</div>}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-5 py-3">
          <span className="text-[12px] text-[var(--color-subtle)]">
            {reason?.required ? "Ctrl + Enter to confirm" : "Enter to confirm, Esc to cancel"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
            <Button ref={confirmRef} variant={confirmVariant} onClick={onConfirm} disabled={confirmDisabled}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
