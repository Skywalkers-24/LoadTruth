import { describe, expect, it, vi } from "vitest";
import { loadQueueTickets } from "./queue-search";
import type { Ticket } from "./api";

describe("search across the queue", () => {
  it("includes tickets beyond the first API page", async () => {
    const page = vi.fn(async (offset: number) => ({
      items: [{ id: String(offset) } as Ticket],
      total: 3,
    }));
    expect((await loadQueueTickets(page)).map((ticket) => ticket.id)).toEqual(["0", "1", "2"]);
    expect(page.mock.calls.map(([offset]) => offset)).toEqual([0, 1, 2]);
  });
  it("stops on an empty page if the queue changes during search", async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ id: "one" }], total: 10 })
      .mockResolvedValue({ items: [], total: 10 });
    expect(await loadQueueTickets(page)).toHaveLength(1);
    expect(page).toHaveBeenCalledTimes(2);
  });
});
