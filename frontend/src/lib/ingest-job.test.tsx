import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useLatestIngestJob } from "./hooks";

const latest = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLatestIngestJob: latest,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot> | undefined;
let client: QueryClient | undefined;
let host: HTMLDivElement;
function Probe() {
  const job = useLatestIngestJob("event-1");
  return (
    <span>
      {job.data?.status}:{job.data?.ticket?.id}
    </span>
  );
}
async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client!}>
        <Probe />
      </QueryClientProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  client?.clear();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
it("recovers processing and the resulting ticket with no retained mutation or query cache", async () => {
  latest.mockResolvedValue({ id: "job-1", status: "running", ticket: null });
  await mount();
  expect(host.textContent).toContain("running");
  await act(async () => root!.unmount());
  client!.clear();
  host.remove();
  // A browser reload discards all React state. The server still owns the job.
  latest.mockResolvedValue({ id: "job-1", status: "completed", ticket: { id: "ticket-1" } });
  await mount();
  expect(host.textContent).toContain("completed:ticket-1");
  expect(latest).toHaveBeenCalledWith("event-1");
});
