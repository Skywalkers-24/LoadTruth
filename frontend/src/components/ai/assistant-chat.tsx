"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon, Loader2Icon, SparklesIcon, WrenchIcon } from "lucide-react";

import { LogoMark } from "@/components/ui/logo";
import { type ChatMessage, TOOL_LABEL } from "@/lib/use-assistant-chat";
import { cn } from "@/lib/utils";

interface AssistantChatProps {
  messages: ChatMessage[];
  busy: boolean;
  prompts: string[];
  canChat: boolean;
  onAsk: (q: string) => void;
  eventName?: string;
  /** Tighter spacing + smaller empty state for the floating widget. */
  density?: "comfortable" | "compact";
}

/**
 * Shared analyst chat surface: an animated empty state with starter prompts, a
 * streaming transcript with grounded tool chips and follow-up suggestions, and
 * a composer. Used by the full AI Analyst page and the console chat widget.
 */
export function AssistantChat({
  messages,
  busy,
  prompts,
  canChat,
  onAsk,
  eventName,
  density = "comfortable",
}: AssistantChatProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const compact = density === "compact";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const empty = messages.length === 0;
  const lastAssistant = messages[messages.length - 1];
  const suggestions = !busy && lastAssistant?.role === "assistant" ? (lastAssistant.suggestions ?? []) : [];

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    onAsk(trimmed);
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Transcript */}
      <div ref={scrollRef} className={cn("lt-scroll min-h-0 flex-1 overflow-y-auto", compact ? "p-3" : "p-4")}>
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span
              className={cn(
                "grid place-items-center rounded-2xl bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
                compact ? "size-11" : "size-14",
              )}
            >
              <LogoMark size={compact ? 22 : 28} className="text-[var(--color-brand)]" />
            </span>
            <div className="flex flex-col gap-1">
              <p className={cn("font-semibold", compact ? "text-[14px]" : "text-[15px]")}>
                Ask about {eventName ?? "this event"}
              </p>
              <p className={cn("max-w-sm text-muted-foreground", compact ? "text-[12px]" : "text-[13px]")}>
                Exposure, over-calls, disputes, anomalies, accuracy, or a summary for an audit.
              </p>
            </div>
            <div className="flex max-w-lg flex-wrap justify-center gap-2">
              {prompts.slice(0, compact ? 3 : 6).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!canChat}
                  onClick={() => submit(p)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-[var(--color-brand)] hover:text-foreground disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m, i) => (
              <li key={i} className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold",
                    m.role === "user"
                      ? "bg-secondary text-foreground"
                      : "bg-[var(--color-brand-soft)] text-[var(--color-brand)]",
                  )}
                >
                  {m.role === "user" ? "You" : <SparklesIcon className="size-3.5" />}
                </span>
                <div className={cn("flex min-w-0 max-w-[82%] flex-col gap-1.5", m.role === "user" && "items-end")}>
                  {m.tools && m.tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.tools.map((t, j) => (
                        <span
                          key={j}
                          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10.5px] text-muted-foreground"
                        >
                          <WrenchIcon className="size-3" />
                          {TOOL_LABEL[t] ?? t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div
                    className={cn(
                      "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-sm bg-[var(--color-brand-fill)] text-white"
                        : "rounded-bl-sm bg-secondary text-foreground",
                    )}
                  >
                    {m.text ||
                      (busy && i === messages.length - 1 ? (
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Loader2Icon className="size-3.5 animate-spin" />
                          <span className="text-[12px]">Analyzing…</span>
                        </span>
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

      {/* Follow-up suggestions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-3 pt-2.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-[11.5px] text-muted-foreground transition-colors hover:border-[var(--color-brand)] hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className={cn("flex items-center gap-2 border-t border-border", compact ? "p-2.5" : "p-3")}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={canChat ? "Ask about this event…" : "Select an event to chat"}
          disabled={!canChat}
          className="h-10 flex-1 rounded-xl border border-border bg-card px-3.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:border-[var(--color-brand)] focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || busy || !canChat}
          aria-label="Send"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-fill)] text-white transition-opacity disabled:opacity-40"
        >
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <ArrowUpIcon className="size-4" />}
        </button>
      </form>
    </div>
  );
}
