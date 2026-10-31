"use client";

import { SparklesIcon } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { AssistantChat } from "@/components/ai/assistant-chat";
import { useEventContext } from "@/lib/event-context";
import { useAssistantChat } from "@/lib/use-assistant-chat";
import { useAuth } from "@/lib/auth";

/**
 * AI Analyst: a full-screen, grounded chat over the active event's data
 * (PLAN.md §3.5, §6). Answers stream in token by token; the analyst's tool
 * calls are shown so every figure is traceable to a real query. It never
 * mutates data. The layout mirrors a focused chat app: a slim header, a
 * full-height transcript, and a composer pinned at the bottom.
 */
export default function AssistantPage() {
  const { member, loading } = useAuth();
  const { selected, selectedId: eventId } = useEventContext();
  const chat = useAssistantChat(eventId, selected?.name);

  if (!loading && member?.role !== "super_admin") {
    return (
      <AppShell section="AI assistant">
        <div className="flex min-h-full items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center">
            <SparklesIcon className="mx-auto size-7 text-[var(--color-brand)]" />
            <h1 className="mt-3 text-base font-semibold">Administrator access required</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The AI assistant is available only in Administrator mode.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell section="AI assistant">
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2.5 pb-3">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            <SparklesIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1 className="lt-page-title">AI assistant</h1>
            <p className="truncate text-[12px] text-muted-foreground">
              Answers questions about {selected?.name ?? "this event"} using its saved records.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card/40 shadow-sm">
          <AssistantChat
            density="full"
            messages={chat.messages}
            busy={chat.busy}
            prompts={chat.prompts}
            canChat={chat.canChat}
            onAsk={chat.ask}
            eventName={selected?.name}
          />
        </div>
      </div>
    </AppShell>
  );
}
