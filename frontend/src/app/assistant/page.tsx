"use client";

import { SparklesIcon } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { AssistantChat } from "@/components/ai/assistant-chat";
import { useEventContext } from "@/lib/event-context";
import { useAssistantChat } from "@/lib/use-assistant-chat";

/**
 * AI Analyst: a full-screen, grounded chat over the active event's data
 * (PLAN.md §3.5, §6). Answers stream in token by token; the analyst's tool
 * calls are shown so every figure is traceable to a real query. It never
 * mutates data. The layout mirrors a focused chat app: a slim header, a
 * full-height transcript, and a composer pinned at the bottom.
 */
export default function AssistantPage() {
  const { selected, selectedId: eventId } = useEventContext();
  const chat = useAssistantChat(eventId, selected?.name);

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
              {chat.isAdministrator
                ? `AI-assisted answers about ${selected?.name ?? "this event"}, grounded in saved records.`
                : `Answers use saved records from ${selected?.name ?? "this event"}. No AI provider is called.`}
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
