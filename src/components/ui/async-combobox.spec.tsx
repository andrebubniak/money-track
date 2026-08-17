import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "@/test-utils/intl";
import { AsyncCombobox } from "@/components/ui/async-combobox";

const options = (count: number, prefix = "Item") =>
  Array.from({ length: count }, (_unused, index) => ({
    id: `id-${index}`,
    name: `${prefix} ${index}`,
  }));

const respondWith = (items: { id: string; name: string }[], hasMore = false) =>
  Promise.resolve(new Response(JSON.stringify({ items, hasMore }), { status: 200 }));

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() => respondWith(options(3)));
  vi.stubGlobal("fetch", fetchMock);
  // The real one needs layout, which jsdom has none of.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const render = (props: Partial<Parameters<typeof AsyncCombobox>[0]> = {}) =>
  renderWithIntl(
    <AsyncCombobox
      endpoint="/api/cards/options"
      value={null}
      onValueChange={() => {}}
      placeholder="Search cards"
      {...props}
    />,
  );

describe("AsyncCombobox", () => {
  it("fetches the first page when opened", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain("/api/cards/options");
    expect(fetchMock.mock.calls[0][0]).toContain("page=1");
  });

  it("sends the active locale, which a route handler cannot resolve itself", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("locale=en-US");
  });

  it("debounces typing into a single request", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render();

    await user.click(screen.getByRole("combobox"));
    await vi.advanceTimersByTimeAsync(400);
    fetchMock.mockClear();

    await user.type(screen.getByRole("combobox"), "abc");
    // Two keystrokes' worth of waiting is not enough to fire anything.
    await vi.advanceTimersByTimeAsync(299);
    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain("q=abc");
  });

  it("resets to page 1 when the search changes", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render();

    await user.click(screen.getByRole("combobox"));
    await vi.advanceTimersByTimeAsync(400);

    await user.type(screen.getByRole("combobox"), "z");
    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain("page=1");
    });
  });

  it("renders the fetched options", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Item 0")).toBeInTheDocument();
    expect(await screen.findByText("Item 2")).toBeInTheDocument();
  });

  it("reports the chosen option's id to the caller", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ onValueChange });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("Item 1"));

    expect(onValueChange).toHaveBeenCalledWith("id-1");
  });

  it("shows the empty state when nothing matches", async () => {
    fetchMock.mockImplementation(() => respondWith([]));
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("No results.")).toBeInTheDocument();
  });

  it("shows an error state when the request fails, and does not throw", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("combobox"));

    expect(await screen.findByText("Couldn't load options. Try again.")).toBeInTheDocument();
  });

  // The edit-page case: the label must be on screen from the first paint,
  // before any request resolves.
  it("displays a preselected option without fetching", () => {
    render({ value: "id-7", selectedOption: { id: "id-7", name: "Personal Visa" } });

    expect(screen.getByRole("combobox")).toHaveValue("Personal Visa");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers an All entry that clears the value when asked", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ allOptionLabel: "All", onValueChange });

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByText("All"));

    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it("marks itself invalid for the form to describe", () => {
    render({ invalid: true });

    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });
});
