"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getChatStarters, streamChat } from "@/lib/api";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools?: string[];
  /** Follow-up suggestions returned with the final answer. */
  suggestions?: string[];
}

/** Human-readable labels for the analyst's grounded tool calls. */
export const TOOL_LABEL: Record<string, string> = {
  event_summary: "Read event totals",
  accuracy_stats: "Checked monitor agreement",
  query_tickets: "Queried tickets",
  query_anomalies: "Queried anomaly flags",
  disputes: "Looked up disputes",
};

const TYPE_INTERVAL_MS = 20;
const TYPE_CHARS_PER_TICK = 3;

/**
 * Shared AI-analyst chat state + streaming. Powers both the full AI Analyst
 * page and the floating console widget, so the two stay in sync and we don't
 * duplicate the SSE wiring. Each call site keeps its own message history.
 */
export function useAssistantChat(eventId: string | undefined, eventName?: string) {
  const starters = useQuery({
    queryKey: ["chat-starters"],
    queryFn: getChatStarters,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const pendingTextRef = useRef("");
  const streamDoneRef = useRef(false);
  const writerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopWriter = useCallback(() => {
    if (writerRef.current !== null) {
      clearInterval(writerRef.current);
      writerRef.current = null;
    }
  }, []);

  const startWriter = useCallback(() => {
    if (writerRef.current !== null) return;
    writerRef.current = setInterval(() => {
      if (pendingTextRef.current.length > 0) {
        const characters = Array.from(pendingTextRef.current);
        const chunk = characters.slice(0, TYPE_CHARS_PER_TICK).join("");
        pendingTextRef.current = characters.slice(TYPE_CHARS_PER_TICK).join("");
        setMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1 ? { ...message, text: message.text + chunk } : message,
          ),
        );
      } else if (streamDoneRef.current) {
        stopWriter();
        setBusy(false);
      }
    }, TYPE_INTERVAL_MS);
  }, [stopWriter]);

  // Abort any in-flight stream on unmount.
  useEffect(
    () => () => {
      abortRef.current?.();
      stopWriter();
    },
    [stopWriter],
  );

  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || !eventId || busy) return;
      setBusy(true);
      pendingTextRef.current = "";
      streamDoneRef.current = false;
      setMessages((m) => [
        ...m,
        { role: "user", text: q },
        { role: "assistant", text: "", tools: [] },
      ]);

      abortRef.current = streamChat(
        { event_id: eventId, message: q, event_name: eventName },
        {
          // Immutable updates: never mutate an existing message object, so
          // React 19 StrictMode / concurrent rendering can't drop or double
          // streamed tokens.
          onTool: (tool) =>
            setMessages((m) =>
              m.map((msg, i) =>
                i === m.length - 1 ? { ...msg, tools: [...(msg.tools ?? []), tool] } : msg,
              ),
            ),
          onToken: (text) => {
            pendingTextRef.current += text;
            startWriter();
          },
          onDone: (suggestions) => {
            setMessages((m) =>
              m.map((msg, i) => (i === m.length - 1 ? { ...msg, suggestions } : msg)),
            );
            streamDoneRef.current = true;
            startWriter();
          },
          onError: () => {
            pendingTextRef.current = "";
            streamDoneRef.current = true;
            stopWriter();
            setMessages((m) =>
              m.map((msg, i) =>
                i === m.length - 1 && !msg.text
                  ? { ...msg, text: "I could not reach the analyst. Try again." }
                  : msg,
              ),
            );
            setBusy(false);
          },
        },
      );
    },
    [eventId, eventName, busy, startWriter, stopWriter],
  );

  const reset = useCallback(() => {
    abortRef.current?.();
    stopWriter();
    pendingTextRef.current = "";
    streamDoneRef.current = false;
    setMessages([]);
    setBusy(false);
  }, [stopWriter]);

  return {
    messages,
    busy,
    ask,
    reset,
    prompts: starters.data?.prompts ?? [],
    canChat: Boolean(eventId),
  };
}
