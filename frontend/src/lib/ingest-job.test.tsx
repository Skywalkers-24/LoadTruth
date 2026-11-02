import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useLatestIngestJob, useSubmitIngestJob } from "./hooks";

const apiMocks = vi.hoisted(() => ({ latest: vi.fn(), submit: vi.fn() }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getLatestIngestJob: apiMocks.latest,
  submitIngestJob: apiMocks.submit,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: ReturnType<typeof createRoot> | undefined;
let client: QueryClient | undefined;
let host: HTMLDivElement;
let submitButton: HTMLButtonElement | null;
function Probe() {
  const job = useLatestIngestJob("event-1");
  const upload = useSubmitIngestJob();
  return (
    <>
      <span>
        {job.data?.status}:{job.data?.ticket?.id}
      </span>
      <button
        type="button"
        ref={(button) => {
          submitButton = button;
        }}
        onClick={() =>
          upload.mutate({
            eventId: "event-1",
            file: new File(["clip"], "clip.mp4", { type: "video/mp4" }),
          })
        }
      >
        Upload
      </button>
    </>
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
  submitButton = null;
  vi.resetAllMocks();
});
it("recovers processing and the resulting ticket with no retained mutation or query cache", async () => {
  apiMocks.latest.mockResolvedValue({ id: "job-1", status: "running", ticket: null });
  await mount();
  expect(host.textContent).toContain("running");
  await act(async () => root!.unmount());
  client!.clear();
  host.remove();
  // A browser reload discards all React state. The server still owns the job.
  apiMocks.latest.mockResolvedValue({
    id: "job-1",
    status: "completed",
    ticket: { id: "ticket-1" },
  });
  await mount();
  expect(host.textContent).toContain("completed:ticket-1");
  expect(apiMocks.latest).toHaveBeenCalledWith("event-1");
});

it("does not let an in-flight old completed job replace a newly submitted run", async () => {
  let resolveStale!: (job: { id: string; status: "completed"; ticket: { id: string } }) => void;
  apiMocks.latest.mockReturnValue(
    new Promise((resolve) => {
      resolveStale = resolve;
    }),
  );
  apiMocks.submit.mockResolvedValue({
    id: "job-2",
    event_id: "event-1",
    status: "accepted",
    ticket: null,
  });

  await mount();
  expect(apiMocks.latest).toHaveBeenCalledOnce();
  await act(async () => {
    submitButton!.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(host.textContent).toContain("accepted:");

  await act(async () => {
    resolveStale({ id: "job-1", status: "completed", ticket: { id: "old-ticket" } });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(host.textContent).toContain("accepted:");
  expect(host.textContent).not.toContain("old-ticket");
  expect(client!.getQueryData(["ingest-job", "event-1"])).toMatchObject({
    id: "job-2",
    status: "accepted",
  });
});
