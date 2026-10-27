"use client";

import { useEffect, useState } from "react";
import { MessageSquareIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";

import { AssistantChat } from "@/components/ai/assistant-chat";
import { useEventContext } from "@/lib/event-context";
import { useAssistantChat } from "@/lib/use-assistant-chat";
import { cn } from "@/lib/utils";

/**
 * Floating AI-analyst chat widget, in the style of a website support chatbot.
 * Mounted once in AppShell so the analyst is one click away on every page. A
 * launcher pins to the bottom-right; clicking it opens a compact chat panel
 * grounded in the active event. `page` labels which screen the user is on so
 * the panel can reference it (e.g. "You're on Reports").
 */
export function AssistantWidget({ page }: { page?: string }) {
  const { selected, selectedId: eventId } = useEventContext();
  const chat = useAssistantChat(eventId, selected?.name);
  const [open, setOpen] = useState(false);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="AI Analyst"
          className="lt-pop-in fixed bottom-20 right-4 z-[100] flex h-[min(560px,calc(100dvh-7rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl sm:bottom-24 sm:right-6"
        >
          <header className="flex items-center gap-2.5 border-b border-border bg-[var(--color-surface-2)] px-4 py-3">
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              <SparklesIcon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-[13px] font-semibold">AI Analyst</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {[page ? `On ${page}` : null, selected?.name ? `Grounded in ${selected.name}` : "Read-only"]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {chat.messages.length > 0 && (
              <button
                type="button"
                onClick={chat.reset}
                aria-label="Clear conversation"
                title="Clear conversation"
                className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Trash2Icon className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close analyst"
              className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          </header>

          <AssistantChat
            messages={chat.messages}
            busy={chat.busy}
            prompts={chat.prompts}
            canChat={chat.canChat}
            onAsk={chat.ask}
            eventName={selected?.name}
            density="compact"
          />
        </div>
      )}

      {/* Launcher — reads as an AI chat: a chat bubble with a sparkle "AI"
          badge and a hover label, so it's obvious this is the AI Analyst. */}
      <div className="group/ai fixed bottom-20 right-5 z-[100] flex items-center gap-2 sm:bottom-6 sm:right-6">
        {!open && (
          <span className="pointer-events-none hidden items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text)] opacity-0 shadow-md transition-opacity duration-200 group-hover/ai:opacity-100 sm:inline-flex">
            Ask AI Analyst
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close AI Analyst" : "Open AI Analyst"}
          aria-expanded={open}
          className={cn(
            "relative grid size-14 place-items-center rounded-full text-white shadow-xl transition-all",
            "bg-[linear-gradient(140deg,var(--color-brand-strong),var(--color-brand-fill))] hover:scale-105 hover:shadow-2xl",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
          )}
        >
          {/* Soft attention pulse (hidden while open / reduced-motion). */}
          {!open && (
            <span
              aria-hidden
              className="lt-pulse absolute inset-0 rounded-full"
              style={{ ["--color-ok" as string]: "var(--color-brand-fill)" }}
            />
          )}
          {open ? (
            <XIcon className="size-6" />
          ) : (
            <>
              <MessageSquareIcon className="size-6" />
              {/* Sparkle "AI" badge in the corner. */}
              <span className="absolute -right-0.5 -top-0.5 grid size-5 place-items-center rounded-full bg-white text-[var(--color-brand-fill)] shadow ring-2 ring-[var(--color-brand-fill)]">
                <SparklesIcon className="size-3" />
              </span>
            </>
          )}
        </button>
      </div>
    </>
  );
}
