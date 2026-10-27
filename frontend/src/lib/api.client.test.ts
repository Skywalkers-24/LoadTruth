import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "./api";

interface Call {
  url: string;
  init: RequestInit | undefined;
}

/** Stub fetch and capture (url, init) for each call, returning a JSON body. */
function stubFetch(body: unknown, status = 200): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

describe("api client", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lists tickets with event + pagination + filters", async () => {
    const calls = stubFetch({ items: [], total: 0, limit: 10, offset: 0 });
    await api.listTickets({ eventId: "evt-1", status: "draft", limit: 10, offset: 20 });
    expect(calls).toHaveLength(1);
    const url = calls[0]?.url ?? "";
    expect(url).toContain("event_id=evt-1");
    expect(url).toContain("status=draft");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=20");
  });

  it("PATCHes a monitor call with the fill pct in the body", async () => {
    const calls = stubFetch({ id: "t1" });
    await api.setMonitorCall("t1", "80");
    expect(calls[0]?.init?.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ monitor_fill_pct: "80" });
  });

  it("throws ApiError surfacing the backend detail on a non-ok response", async () => {
    stubFetch({ detail: "nope" }, 404);
    // request() now surfaces the backend's `detail` message instead of a generic one.
    await expect(api.getTicket("missing")).rejects.toThrow(/nope/);
  });

  it("creates a truck via POST with a JSON body", async () => {
    const calls = stubFetch({ id: "tr1" }, 201);
    await api.createTruck({ truck_number: "FL-1", certified_cubic_yards: "20" });
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ truck_number: "FL-1" });
  });

  it("handles a 204 DELETE with no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    await expect(api.deleteTruck("tr1")).resolves.toBeUndefined();
  });

  it("tests a source connection", async () => {
    const calls = stubFetch({ ok: true, detail: "config valid" });
    const r = await api.testSource("s1");
    expect(calls[0]?.url).toContain("/sources/s1/test");
    expect(r.ok).toBe(true);
  });
});
