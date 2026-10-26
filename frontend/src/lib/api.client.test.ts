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

  it("throws ApiError on a non-ok response", async () => {
    stubFetch({ detail: "nope" }, 404);
    await expect(api.getTicket("missing")).rejects.toThrow(/failed \(404\)/);
  });
});
