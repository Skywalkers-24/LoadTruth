"use client";

import { useEffect, useState } from "react";
import { MessageSquareIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";

import { AssistantChat } from "@/components/ai/assistant-chat";
import { useAuth } from "@/lib/auth";
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
  const { member } = useAuth();
  const { selected, selectedId: eventId } = useEventContext();
  const chat = useAssistantChat(eventId, selected?.name);
  const [open, setOpen] = useState(false);
  const isAdministrator = member?.role === "super_admin";

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
      {open && isAdministrator && (
        <div
          role="dialog"
          aria-label="AI assistant"
          className="lt-pop-in fixed bottom-20 right-4 z-[100] flex h-[min(560px,calc(100dvh-7rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:bottom-16"
        >
          <header className="flex items-center gap-2.5 border-b border-border bg-[var(--color-surface-2)] px-4 py-3">
            <span className="grid size-8 place-items-center rounded-lg bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
              <SparklesIcon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="text-[13px] font-semibold">AI assistant</span>
              <span className="truncate text-[11px] text-muted-foreground">
                {[
                  page ? `On ${page}` : null,
                  selected?.name ? `Grounded in ${selected.name}` : "Read-only",
                ]
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

      {/* Keep the compact analyst launcher floating above page content. */}
      <div className="group/ai fixed bottom-4 right-4 z-[100] flex items-center gap-2 lg:right-0">
        {!open && (
          <span className="pointer-events-none hidden items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-text)] opacity-0 shadow-md transition-opacity duration-200 group-hover/ai:opacity-100 sm:inline-flex">
            Ask the AI assistant
          </span>
        )}
        <button
          type="button"
          disabled={!isAdministrator}
          onClick={() => {
            if (isAdministrator) setOpen((v) => !v);
          }}
          aria-label={open ? "Close AI assistant" : "Open AI assistant"}
          aria-expanded={open}
          title={
            isAdministrator
              ? "Open AI assistant"
              : "The AI assistant is available in Administrator mode only"
          }
          className={cn(
            "relative grid size-11 place-items-center rounded-full text-white shadow-lg transition-[transform,box-shadow] duration-200",
            isAdministrator
              ? "bg-[linear-gradient(140deg,var(--color-brand-strong),var(--color-brand-fill))] hover:scale-[1.03] hover:shadow-xl"
              : "cursor-not-allowed bg-muted text-muted-foreground opacity-70",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
          )}
        >
          {open ? <XIcon className="size-5" /> : <MessageSquareIcon className="size-5" />}
        </button>
      </div>
    </>
  );
}
