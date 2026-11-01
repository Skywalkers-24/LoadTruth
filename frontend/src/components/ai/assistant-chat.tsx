"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpIcon, DatabaseIcon, Loader2Icon, SparklesIcon, WrenchIcon } from "lucide-react";

import { LogoMark } from "@/components/ui/logo";
import { type ChatMessage, TOOL_LABEL } from "@/lib/use-assistant-chat";
import { cn } from "@/lib/utils";

type Density = "comfortable" | "compact" | "full";

interface AssistantChatProps {
  messages: ChatMessage[];
  busy: boolean;
  prompts: string[];
  canChat: boolean;
  onAsk: (q: string) => void;
  eventName?: string;
  /**
   * Layout mode:
   * - `compact`: the floating widget (tight spacing, small empty state)
   * - `comfortable`: a bordered card panel
   * - `full`: a full-screen, ChatGPT-style page (centered reading column,
   *   roomy transcript, composer pinned at the bottom)
   */
  density?: Density;
}

/**
 * Shared analyst chat surface: an empty state with starter prompts, a
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
  const taRef = useRef<HTMLTextAreaElement>(null);
  const compact = density === "compact";
  const full = density === "full";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-grow the full-screen textarea composer up to a few lines.
  useEffect(() => {
    if (!full) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [input, full]);

  const empty = messages.length === 0;
  const lastAssistant = messages[messages.length - 1];
  const suggestions =
    !busy && lastAssistant?.role === "assistant" ? (lastAssistant.suggestions ?? []) : [];

  // Full mode expands 100% across the container.
  const col = full ? "w-full max-w-none" : "";

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    onAsk(trimmed);
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Transcript */}
      <div
        ref={scrollRef}
        className={cn(
          "lt-scroll min-h-0 flex-1 overflow-y-auto",
          compact ? "p-3" : full ? "px-4 py-6 sm:px-6" : "p-4",
        )}
      >
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span
              className={cn(
                "grid place-items-center rounded-2xl bg-[var(--color-brand-soft)] p-2",
                compact ? "size-12" : full ? "size-20" : "size-16",
              )}
            >
              <LogoMark size={compact ? 28 : full ? 44 : 36} variant="transparent" />
            </span>
            <div className="flex flex-col gap-1">
              <p
                className={cn(
                  "font-semibold",
                  compact ? "text-[14px]" : full ? "text-[20px]" : "text-[15px]",
                )}
              >
                Ask about {eventName ?? "this event"}
              </p>
              <p
                className={cn(
                  "max-w-sm text-muted-foreground",
                  compact ? "text-[12px]" : full ? "text-[14px]" : "text-[13px]",
                )}
              >
                Load estimates, inspector differences, disputes, review flags, or an event summary.
              </p>
            </div>
            <div
              className={cn(
                "flex flex-wrap justify-center gap-2",
                full ? "w-full max-w-4xl" : "max-w-lg",
              )}
            >
              {prompts.slice(0, compact ? 3 : 6).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={!canChat}
                  onClick={() => submit(p)}
                  className={cn(
                    "rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--color-brand)] hover:text-foreground disabled:opacity-40",
                    full ? "px-4 py-2 text-[13px]" : "px-3 py-1.5 text-[12px]",
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className={cn("flex flex-col", full ? "gap-6" : "gap-4", col)}>
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
                <div
                  className={cn(
                    "flex min-w-0 flex-col gap-1.5",
                    full ? "max-w-[calc(100%-2.5rem)]" : "max-w-[82%]",
                    m.role === "user" && "items-end",
                  )}
                >
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
                  {m.role === "assistant" && m.analysisMode && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                      {m.analysisMode === "muse" ? (
                        <>
                          <SparklesIcon className="size-3 text-[var(--color-brand)]" />
                          AI-assisted answer
                        </>
                      ) : (
                        <>
                          <DatabaseIcon className="size-3" />
                          Calculated from saved records
                        </>
                      )}
                    </span>
                  )}
                  <div
                    className={cn(
                      "whitespace-pre-wrap rounded-2xl leading-relaxed",
                      full ? "px-4 py-3 text-[14px]" : "px-3.5 py-2.5 text-[13px]",
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

      {/* Follow-up suggestions — contextual next questions offered after an answer. */}
      {suggestions.length > 0 && (
        <div
          className={cn(
            "lt-fade-in border-t border-border",
            full ? "px-4 pt-2.5 sm:px-6" : "px-3 pt-2.5",
          )}
        >
          <div className={cn("flex flex-col gap-1.5", col)}>
            <span className="flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
              <SparklesIcon className="size-3 text-[var(--color-brand)]" />
              Suggested follow-ups
            </span>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--color-brand-soft)] bg-[var(--color-brand-soft)] px-2.5 py-1 text-[11.5px] text-[var(--color-brand)] transition-colors hover:border-[var(--color-brand)] hover:bg-card"
                >
                  <ArrowUpIcon className="size-3 rotate-45" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Composer. Full mode uses a ChatGPT-style rounded textarea pinned at the
          bottom; the other modes keep the single-line input. */}
      {full ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="border-t border-border px-4 py-4 sm:px-6"
        >
          <div className={cn("relative", col)}>
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              placeholder={canChat ? "Ask about this event…" : "Select an event to chat"}
              disabled={!canChat}
              className="lt-scroll max-h-[200px] w-full resize-none rounded-2xl border border-border bg-card py-3.5 pl-4 pr-14 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-[var(--color-brand)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy || !canChat}
              aria-label="Send"
              className="absolute bottom-2.5 right-2.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--color-brand-fill)] text-white transition-opacity disabled:opacity-40"
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="size-4" />
              )}
            </button>
          </div>
          <p className={cn("mt-2 text-center text-[11px] text-muted-foreground", col)}>
            Read-only. The analyst answers from your real event data. Enter to send, Shift+Enter for
            a new line.
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className={cn(
            "flex items-center gap-2 border-t border-border",
            compact ? "p-2.5" : "p-3",
          )}
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
            {busy ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <ArrowUpIcon className="size-4" />
            )}
          </button>
        </form>
      )}
    </div>
  );
}
