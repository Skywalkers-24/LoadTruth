"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpIcon, Loader2Icon, SparklesIcon, WrenchIcon } from "lucide-react";

import { AppShell } from "@/components/shell/app-shell";
import { LogoMark } from "@/components/ui/logo";
import { Card } from "@/components/ui/shadcn/card";
import { getChatStarters, streamChat } from "@/lib/api";
import { useEventContext } from "@/lib/event-context";
import { cn } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  text: string;
  tools?: string[];
}

const TOOL_LABEL: Record<string, string> = {
  event_summary: "Read event totals",
  accuracy_stats: "Checked fill accuracy",
  query_tickets: "Queried tickets",
  query_anomalies: "Queried anomaly flags",
  disputes: "Looked up disputes",
};

/**
 * AI Analyst: a read-only, grounded chat over the active event's data (PLAN.md
 * §3.5, §6). Answers stream in token by token; the analyst's tool calls are
 * shown so every figure is traceable to a real query. It never mutates data.
 */
export default function AssistantPage() {
  const { selected, selectedId: eventId } = useEventContext();
  const starters = useQuery({ queryKey: ["chat-starters"], queryFn: getChatStarters, retry: false });
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abortRef.current?.(), []);

  function ask(question: string) {
    const q = question.trim();
    if (!q || !eventId || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "", tools: [] }]);

    abortRef.current = streamChat(
      { event_id: eventId, message: q, event_name: selected?.name },
      {
        onTool: (tool) =>
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last) last.tools = [...(last.tools ?? []), tool];
            return copy;
          }),
        onToken: (text) =>
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last) last.text += text;
            return copy;
          }),
        onDone: () => setBusy(false),
        onError: () => {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last && !last.text) last.text = "I could not reach the analyst. Try again.";
            return copy;
          });
          setBusy(false);
        },
      },
    );
  }

  const empty = messages.length === 0;
  const prompts = starters.data?.prompts ?? [];

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
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            {empty ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]">
                  <LogoMark size={28} className="text-[var(--color-brand)]" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-[15px] font-semibold">Ask about this event</p>
                  <p className="max-w-sm text-[13px] text-muted-foreground">
                    Exposure, over-calls, disputes, anomalies, accuracy, or a summary for an audit.
                  </p>
                </div>
                <div className="flex max-w-lg flex-wrap justify-center gap-2">
                  {prompts.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => ask(p)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-[var(--color-brand)] hover:text-foreground"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-4">
                {messages.map((m, i) => (
                  <li key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg text-[12px] font-bold",
                        m.role === "user"
                          ? "bg-secondary text-foreground"
                          : "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
                      )}
                    >
                      {m.role === "user" ? "You" : <SparklesIcon className="size-4" />}
                    </span>
                    <div className={cn("flex min-w-0 max-w-[80%] flex-col gap-1.5", m.role === "user" && "items-end")}>
                      {m.tools && m.tools.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {m.tools.map((t, j) => (
                            <span
                              key={j}
                              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              <WrenchIcon className="size-3" />
                              {TOOL_LABEL[t] ?? t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div
                        className={cn(
                          "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed",
                          m.role === "user"
                            ? "bg-[var(--color-brand-fill)] text-white"
                            : "bg-secondary text-foreground",
                        )}
                      >
                        {m.text || (busy && i === messages.length - 1 ? (
                          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          ""
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 border-t border-border p-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about this event…"
              className="h-10 flex-1 rounded-xl border border-border bg-card px-3.5 text-[13.5px] text-foreground placeholder:text-muted-foreground focus:border-[var(--color-brand)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              aria-label="Send"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-fill)] text-white transition-opacity disabled:opacity-40"
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <ArrowUpIcon className="size-4" />}
            </button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
