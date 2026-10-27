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
  accuracy_stats: "Checked fill accuracy",
  query_tickets: "Queried tickets",
  query_anomalies: "Queried anomaly flags",
  disputes: "Looked up disputes",
};

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

  // Abort any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.(), []);

  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || !eventId || busy) return;
      setBusy(true);
      setMessages((m) => [...m, { role: "user", text: q }, { role: "assistant", text: "", tools: [] }]);

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
          onToken: (text) =>
            setMessages((m) =>
              m.map((msg, i) => (i === m.length - 1 ? { ...msg, text: msg.text + text } : msg)),
            ),
          onDone: (suggestions) => {
            setMessages((m) =>
              m.map((msg, i) => (i === m.length - 1 ? { ...msg, suggestions } : msg)),
            );
            setBusy(false);
          },
          onError: () => {
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
    [eventId, eventName, busy],
  );

  const reset = useCallback(() => {
    abortRef.current?.();
    setMessages([]);
    setBusy(false);
  }, []);

  return {
    messages,
    busy,
    ask,
    reset,
    prompts: starters.data?.prompts ?? [],
    canChat: Boolean(eventId),
  };
}
