import type { Ticket } from "./api";

/** Search must cover the event, including tickets outside the visible queue page. */
export async function loadQueueTickets(
  fetchPage: (offset: number) => Promise<{ items: Ticket[]; total: number }>,
  signal?: AbortSignal,
): Promise<Ticket[]> {
  const items: Ticket[] = [];
  while (!signal?.aborted) {
    const page = await fetchPage(items.length);
    if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
    if (!page.items.length) break;
    items.push(...page.items);
    if (items.length >= page.total) break;
  }
  return items;
}
