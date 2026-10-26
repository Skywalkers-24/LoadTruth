import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealth } from "./api";

describe("getHealth", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns parsed health on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ status: "ok", environment: "test", model_api_configured: false }),
            { status: 200 },
          ),
      ),
    );
    const health = await getHealth();
    expect(health).toEqual({ status: "ok", environment: "test", model_api_configured: false });
  });

  it("returns null when the backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    expect(await getHealth()).toBeNull();
  });

  it("returns null on non-ok status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    expect(await getHealth()).toBeNull();
  });
});
