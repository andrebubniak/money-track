import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

import { QueryProvider } from "@/components/providers/query-provider";
import { renderWithIntl } from "@/test-utils/intl";
import { useAsyncOptions, useInvalidateAsyncOptions } from "@/hooks/use-async-options";
import enUS from "../../messages/en-US.json";

type Option = { id: string; text: string };

const respondWith = (items: Option[]) =>
  Promise.resolve(new Response(JSON.stringify({ items, hasMore: false }), { status: 200 }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => respondWith([{ id: "c-1", text: "Groceries" }]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Stands in for a dropdown and the form that writes the rows behind it,
 * sharing one `QueryClient` the way the real app's pages do.
 */
function Probe() {
  const { items } = useAsyncOptions<Option>({
    endpoint: "/api/categories/options",
    search: "",
    enabled: true,
  });
  const invalidateOptions = useInvalidateAsyncOptions();

  return (
    <>
      <button type="button" onClick={() => void invalidateOptions()}>
        save
      </button>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </>
  );
}

/**
 * A field that opens and closes, under the app's *own* provider rather than
 * the test one. `createTestQueryClient` sets `staleTime: 0`, which is the
 * very thing under test here — a spec that used it would pass no matter what
 * `useAsyncOptions` asked for.
 */
function TogglingProbe() {
  const [open, setOpen] = useState(false);
  const { items } = useAsyncOptions<Option>({
    endpoint: "/api/cards/options",
    search: "",
    enabled: open,
  });

  return (
    <>
      <button type="button" onClick={() => setOpen((current) => !current)}>
        toggle
      </button>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </>
  );
}

function renderWithAppProvider(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={enUS}>
      <QueryProvider>{ui}</QueryProvider>
    </NextIntlClientProvider>,
  );
}

describe("useAsyncOptions", () => {
  /**
   * The bug this exists for: a card created in one tab stayed missing from
   * another tab's dropdown until that tab was reloaded.
   * `useInvalidateAsyncOptions` cannot fix it — the other tab has its own
   * `QueryClient` and never hears the invalidation — so the field revalidates
   * whenever it opens, with nothing having told it to.
   */
  it("revalidates every time the field opens, with no invalidation at all", async () => {
    const user = userEvent.setup();
    renderWithAppProvider(<TogglingProbe />);

    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(await screen.findByText("Groceries")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "toggle" }));

    // Written by something this `QueryClient` has no way of knowing about.
    fetchMock.mockImplementation(() =>
      respondWith([
        { id: "c-1", text: "Groceries" },
        { id: "c-2", text: "Pet supplies" },
      ]),
    );

    await user.click(screen.getByRole("button", { name: "toggle" }));

    expect(await screen.findByText("Pet supplies")).toBeInTheDocument();
  });

  // The rows that are already there stay put while the revalidation is out,
  // so reopening a field does not blink through an empty list.
  it("keeps the rows it already had on screen while it revalidates", async () => {
    const user = userEvent.setup();
    renderWithAppProvider(<TogglingProbe />);

    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "toggle" }));

    let release = () => {};
    fetchMock.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(respondWith([{ id: "c-1", text: "Groceries" }])); }),
    );

    await user.click(screen.getByRole("button", { name: "toggle" }));

    // The request is still out, and the previous row has not gone anywhere.
    expect(screen.getByText("Groceries")).toBeInTheDocument();
    release();
  });
});

describe("useInvalidateAsyncOptions", () => {
  // The bug this exists for: a category saved on /categories was missing from
  // the transaction form's category field until the cached page went stale.
  it("refetches the cached options so a just-saved row appears at once", async () => {
    const user = userEvent.setup();
    renderWithIntl(<Probe />);

    expect(await screen.findByText("Groceries")).toBeInTheDocument();

    fetchMock.mockImplementation(() =>
      respondWith([
        { id: "c-1", text: "Groceries" },
        { id: "c-2", text: "Pet supplies" },
      ]),
    );

    // Without the invalidation this stays stale for `staleTime`, and the new
    // category is simply absent.
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(await screen.findByText("Pet supplies")).toBeInTheDocument();
  });

  // Revalidating on open is not the same as polling: a field left open sits
  // on the one request it made.
  it("does not refetch on its own while the field stays open", async () => {
    renderWithIntl(<Probe />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
