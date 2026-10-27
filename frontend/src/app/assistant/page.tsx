"use client";

import { SparklesIcon } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { AssistantChat } from "@/components/ai/assistant-chat";
import { Card } from "@/components/ui/shadcn/card";
import { useEventContext } from "@/lib/event-context";
import { useAssistantChat } from "@/lib/use-assistant-chat";

/**
 * AI Analyst: a read-only, grounded chat over the active event's data (PLAN.md
 * §3.5, §6). Answers stream in token by token; the analyst's tool calls are
 * shown so every figure is traceable to a real query. It never mutates data.
 */
export default function AssistantPage() {
  const { selected, selectedId: eventId } = useEventContext();
  const chat = useAssistantChat(eventId, selected?.name);

  return (
    <AppShell section="AI Analyst">
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
            <SparklesIcon className="size-5" />
          </span>
          <div className="flex flex-col">
            <h1 className="text-[18px] font-semibold leading-tight tracking-tight">AI Analyst</h1>
            <p className="text-[12px] text-muted-foreground">
              Grounded in {selected?.name ?? "this event"}. Read-only; it answers from your real data.
            </p>
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
          <AssistantChat
            messages={chat.messages}
            busy={chat.busy}
            prompts={chat.prompts}
            canChat={chat.canChat}
            onAsk={chat.ask}
            eventName={selected?.name}
          />
        </Card>
      </div>
    </AppShell>
  );
}
