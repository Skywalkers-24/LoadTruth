"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

import { AlertIcon, CheckCircleIcon, InfoIcon, XIcon } from "@/components/ui/icons";

type ToastTone = "ok" | "danger" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  push: (tone: ToastTone, message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, { color: string; soft: string; Icon: typeof InfoIcon }> = {
  ok: { color: "var(--color-ok)", soft: "var(--color-ok-soft)", Icon: CheckCircleIcon },
  danger: { color: "var(--color-danger)", soft: "var(--color-danger-soft)", Icon: AlertIcon },
  info: { color: "var(--color-info)", soft: "var(--color-surface-3)", Icon: InfoIcon },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => {
          const s = TONE_STYLE[t.tone];
          return (
            <div
              key={t.id}
              className="lt-card-shadow pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px]"
              style={{ borderColor: s.color, backgroundColor: "var(--color-surface)" }}
            >
              <span className="mt-0.5 shrink-0" style={{ color: s.color }}>
                <s.Icon size={16} />
              </span>
              <span className="flex-1 text-[var(--color-text)]">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 text-[var(--color-subtle)] hover:text-[var(--color-text)]"
              >
                <XIcon size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
