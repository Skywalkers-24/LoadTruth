"use client";

import { useState } from "react";

import type { Source, SourceKind } from "@/lib/api";
import { useSourceMutations, useSources } from "@/lib/hooks";

const KINDS: { value: SourceKind; label: string; configKey?: string; hint?: string }[] = [
  { value: "upload", label: "File upload" },
  { value: "rtsp", label: "RTSP stream", configKey: "url", hint: "rtsp://tower/stream" },
  { value: "hls", label: "HLS stream", configKey: "url", hint: "https://…/index.m3u8" },
  { value: "ip_camera", label: "IP camera", configKey: "url", hint: "http://cam/stream" },
  { value: "cloud_bucket", label: "Cloud bucket", configKey: "bucket", hint: "bucket name" },
  { value: "webhook", label: "Webhook", configKey: "endpoint", hint: "https://…/hook" },
  { value: "mobile", label: "Mobile capture", configKey: "device_id", hint: "device id" },
];

/** Source-connections admin: list + add (kind-aware config) + test + delete. */
export function SourceConnections({ eventId }: { eventId: string }) {
  const sources = useSources(eventId);
  const { create, remove, test } = useSourceMutations(eventId);
  const [kind, setKind] = useState<SourceKind>("rtsp");
  const [name, setName] = useState("");
  const [configValue, setConfigValue] = useState("");
  const [result, setResult] = useState<Record<string, string>>({});

  const spec = KINDS.find((k) => k.value === kind)!;

  function add(e: React.FormEvent) {
    e.preventDefault();
    const config =
      spec.configKey && configValue.trim() ? { [spec.configKey]: configValue.trim() } : {};
    create.mutate(
      { kind, name: name.trim() || spec.label, config },
      {
        onSuccess: () => {
          setName("");
          setConfigValue("");
        },
      },
    );
  }

  function runTest(id: string) {
    test.mutate(id, {
      onSuccess: (r) =>
        setResult((prev) => ({ ...prev, [id]: r.ok ? `OK — ${r.detail}` : r.detail })),
    });
  }

  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h2 className="mb-4 text-sm font-semibold">Source connections</h2>

      <form onSubmit={add} className="mb-4 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as SourceKind)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tower cam 1"
            className="w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </label>
        {spec.configKey && (
          <label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
            {spec.configKey}
            <input
              value={configValue}
              onChange={(e) => setConfigValue(e.target.value)}
              placeholder={spec.hint}
              className="w-52 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
            />
          </label>
        )}
        <button
          type="submit"
          disabled={create.isPending}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-40"
        >
          Connect
        </button>
      </form>

      {sources.isLoading ? (
        <p className="text-sm text-[var(--color-muted)]">Loading…</p>
      ) : (sources.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">No sources connected.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {sources.data?.map((s: Source) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
            >
              <span className="flex flex-col">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-[var(--color-muted)]">
                  {s.kind} · {s.status}
                  {result[s.id] && ` · ${result[s.id]}`}
                </span>
              </span>
              <span className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => runTest(s.id)}
                  disabled={test.isPending}
                  className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-40"
                >
                  Test
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(s.id)}
                  disabled={remove.isPending}
                  className="rounded-md border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-danger)] hover:border-[var(--color-danger)] disabled:opacity-40"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
