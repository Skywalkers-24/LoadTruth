"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { getChatStarters, streamChat } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  tools?: string[];
  analysisMode?: "muse" | "grounded";
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
  debris_class_analytics: "Compared debris classes",
  top_overcalls: "Ranked over-calls",
};

const TYPE_INTERVAL_MS = 20;
const TYPE_CHARS_PER_TICK = 3;

/**
 * Shared analyst chat state + streaming. Powers both the full analyst
 * page and the floating console widget, so the two stay in sync and we don't
 * duplicate the SSE wiring. Each call site keeps its own message history.
 */
export function useAssistantChat(eventId: string | undefined, eventName?: string) {
  const { member } = useAuth();
  const isAdministrator =
    member?.role === "super_admin" || member?.role === "county_admin";
  const starters = useQuery({
    queryKey: ["chat-starters"],
    queryFn: getChatStarters,
    retry: false,
    staleTime: 5 * 60_000,
    enabled: Boolean(member),
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);
  const eventRef = useRef(eventId);
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

  useEffect(() => {
    if (member) return;
    abortRef.current?.();
    stopWriter();
    pendingTextRef.current = "";
    streamDoneRef.current = false;
    setMessages([]);
    setBusy(false);
  }, [member, stopWriter]);

  // A conversation is scoped to one event. Clear it immediately when the
  // workspace selector changes so prior-event answers cannot linger.
  useEffect(() => {
    if (eventRef.current === eventId) return;
    eventRef.current = eventId;
    abortRef.current?.();
    stopWriter();
    pendingTextRef.current = "";
    streamDoneRef.current = false;
    setMessages([]);
    setBusy(false);
  }, [eventId, stopWriter]);

  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q || !eventId || !member || busy) return;
      setBusy(true);
      pendingTextRef.current = "";
      streamDoneRef.current = false;
      setMessages((m) => [
        ...m,
        { role: "user", text: q },
        { role: "assistant", text: "", tools: [] },
      ]);

      abortRef.current = streamChat(
        {
          event_id: eventId,
          message: q,
          event_name: eventName,
          prior_questions: messages
            .filter((message) => message.role === "user")
            .slice(-6)
            .map((message) => message.text.slice(0, 500)),
        },
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
          onDone: (suggestions, analysisMode) => {
            setMessages((m) =>
              m.map((msg, i) => (i === m.length - 1 ? { ...msg, suggestions, analysisMode } : msg)),
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
    [eventId, eventName, member, busy, messages, startWriter, stopWriter],
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
    canChat: Boolean(eventId && member),
    isAdministrator,
  };
}
