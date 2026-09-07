import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl, withProviders } from "@/test-utils/intl";
import { AsyncCombobox, type ComboboxItemShape } from "@/components/ui/async-combobox";

const options = (count: number, prefix = "Item") =>
  Array.from({ length: count }, (_unused, index) => ({
    id: `id-${index}`,
    text: `${prefix} ${index}`,
  }));

const respondWith = (items: { id: string; text: string }[], hasMore = false) =>
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

// The endpoint half of the source union — `Partial` of the whole union
// would let `fetchPage` and `endpoint` be passed together.
type Props = Extract<
  Parameters<typeof AsyncCombobox<ComboboxItemShape>>[0],
  { endpoint: string }
>;

const view = (props: Partial<Props> = {}) => (
  <AsyncCombobox
    endpoint="/api/cards/options"
    value={null}
    onValueChange={() => {}}
    placeholder="Search cards"
    {...props}
  />
);

const render = (props: Partial<Props> = {}) => renderWithIntl(view(props));

/** The field itself: a button, not an input, since the search box lives in the popup. */
const field = () => screen.getByRole("combobox");

/**
 * The search box inside the popup. `find`, not `get`: the popup mounts a
 * tick after the click that opens it.
 */
const searchBox = () => screen.findByPlaceholderText("Search…");

describe("AsyncCombobox", () => {
  it("fetches the first page when opened", async () => {
    const user = userEvent.setup();
    render();

    await user.click(field());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain("/api/cards/options");
    expect(fetchMock.mock.calls[0][0]).toContain("page=1");
  });

  it("sends the active locale, which a route handler cannot resolve itself", async () => {
    const user = userEvent.setup();
    render();

    await user.click(field());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain("locale=en-US");
  });

  // The search box is a separate control from the trigger, so the selected
  // label has nothing to write back over what is being typed. When the field
  // itself was the input, every keystroke over an existing selection was
  // reverted to that selection's label — see e2e/transactions.spec.ts.
  it("lets an existing selection be typed over", async () => {
    const user = userEvent.setup();
    render({ value: "id-1", selectedOption: { id: "id-1", text: "Item 1" } });

    // Held onto before opening: the popup's own input is a combobox too, so
    // `field()` is ambiguous once it is on screen.
    const trigger = field();
    await user.click(trigger);
    await user.type(await searchBox(), "gro");

    expect(await searchBox()).toHaveValue("gro");
    expect(trigger).toHaveTextContent("Item 1");
  });

  it("debounces typing into a single request", async () => {
    const user = userEvent.setup();
    render();

    await user.click(field());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await user.type(await searchBox(), "abc");

    // Undebounced, the three keystrokes would be three requests — "q=a",
    // "q=ab", "q=abc". One request for the settled query is the whole point.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toContain("q=abc");
  });

  it("honors a debounceMs of its own", async () => {
    // Real timers here: this one asserts that 400ms of *not* firing means the
    // prop won over the 300ms default, which a fake clock cannot show.
    const user = userEvent.setup();
    render({ debounceMs: 1000 });

    await user.click(field());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockClear();

    await user.type(await searchBox(), "abc");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).not.toHaveBeenCalled();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(fetchMock.mock.calls[0][0]).toContain("q=abc");
  });

  it("resets to page 1 when the search changes", async () => {
    fetchMock.mockImplementation(() => respondWith(options(10), true));
    const user = userEvent.setup();
    render();

    await user.click(field());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    await user.type(await searchBox(), "z");

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls.at(-1)?.[0] as string;
      expect(lastCall).toContain("q=z");
      expect(lastCall).toContain("page=1");
    });
  });

  it("renders the fetched options", async () => {
    const user = userEvent.setup();
    render();

    await user.click(field());

    expect(await screen.findByText("Item 0")).toBeInTheDocument();
    expect(await screen.findByText("Item 2")).toBeInTheDocument();
  });

  it("focuses the popup's search input on open, so typing goes straight to it", async () => {
    const user = userEvent.setup();
    render();

    await user.click(field());

    await waitFor(async () => expect(await searchBox()).toHaveFocus());
  });

  it("reports the chosen option's id to the caller", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ onValueChange });

    await user.click(field());
    await user.click(await screen.findByText("Item 1"));

    expect(onValueChange).toHaveBeenCalledWith("id-1");
  });

  it("shows the empty state when nothing matches", async () => {
    fetchMock.mockImplementation(() => respondWith([]));
    const user = userEvent.setup();
    render();

    await user.click(field());

    expect(await screen.findByText("No results found.")).toBeInTheDocument();
  });

  it("shows an error state when the request fails, and does not throw", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new Error("offline")));
    const user = userEvent.setup();
    render();

    await user.click(field());

    expect(await screen.findByText("Couldn't load options. Try again.")).toBeInTheDocument();
  });

  // The edit-page case: the label must be on screen from the first paint,
  // before any request resolves.
  it("displays a preselected option without fetching", () => {
    render({ value: "id-7", selectedOption: { id: "id-7", text: "Personal Visa" } });

    expect(field()).toHaveTextContent("Personal Visa");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the placeholder on the trigger while nothing is selected", () => {
    render();

    expect(field()).toHaveTextContent("Search cards");
  });

  it("offers an All entry that clears the value when asked", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({
      allOptionLabel: "All",
      value: "id-1",
      selectedOption: { id: "id-1", text: "Item 1" },
      onValueChange,
    });

    await user.click(field());
    await user.click(await screen.findByRole("option", { name: "All" }));

    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  // "All" undoes a filter rather than applying one, so it does not read as
  // just another option in the list.
  it("renders the All entry in bold", async () => {
    const user = userEvent.setup();
    render({ allOptionLabel: "All" });

    const trigger = field();
    await user.click(trigger);

    // Scoped to the row: the trigger also reads "All" while the value is
    // null, and it is deliberately *not* bold there.
    const row = await screen.findByRole("option", { name: "All" });
    expect(within(row).getByText("All")).toHaveClass("font-bold");
    expect(within(trigger).getByText("All")).not.toHaveClass("font-bold");
  });

  // A query that matched nothing is exactly when the way back out of the
  // filter is wanted, so the All row stays — alongside the empty message,
  // which Base UI's own `Combobox.Empty` would suppress once the row makes
  // its item count non-zero.
  it("keeps the All entry offered when the search found nothing", async () => {
    fetchMock.mockImplementation(() => respondWith([]));
    const user = userEvent.setup();
    render({ allOptionLabel: "All" });

    await user.click(field());

    // Waited on rather than read straight away: All is on screen from the
    // first frame, while the message is still "Loading…" until the empty
    // response lands.
    expect(await screen.findByText("No results found.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All" })).toBeInTheDocument();
  });

  // The whole point of a search is that it narrows: the selected row drops
  // off the loaded page as soon as the query stops matching it. No
  // `selectedOption` here, so the label has nowhere to come from but the
  // component's own memory of what it last resolved.
  it("keeps showing the selection when the search no longer returns it", async () => {
    const user = userEvent.setup();
    render({ value: "id-1" });

    const trigger = field();
    await user.click(trigger);
    await waitFor(() => expect(trigger).toHaveTextContent("Item 1"));

    // Ids of its own, not `options()`'s: a second batch reusing `id-1` would
    // resolve the label from the new page and prove nothing.
    fetchMock.mockImplementation(() =>
      respondWith([{ id: "other-0", text: "Other 0" }]),
    );
    await user.type(await searchBox(), "other");

    await waitFor(() => expect(screen.getByText("Other 0")).toBeInTheDocument());
    expect(screen.queryByText("Item 0")).not.toBeInTheDocument();
    expect(trigger).toHaveTextContent("Item 1");
  });

  // "No value" and "All" both report `null` to the caller, but they are not
  // the same thing to look at: clearing empties the field.
  it("clears to the placeholder rather than to All", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render({
      allOptionLabel: "All",
      value: "id-7",
      selectedOption: { id: "id-7", text: "Personal Visa" },
      clearable: true,
      onValueChange,
    });

    expect(field()).toHaveTextContent("Personal Visa");

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onValueChange).toHaveBeenCalledWith(null);

    // The caller does what the callback asked, and the field must not come
    // back reading "All".
    rerender(withProviders(view({ allOptionLabel: "All", value: null, clearable: true })));

    expect(field()).toHaveTextContent("Search cards");
    expect(field()).not.toHaveTextContent("All");
  });

  // Clearing is not a one-way door: All is still there to pick afterwards.
  it("goes back to All when it is picked after a clear", async () => {
    const user = userEvent.setup();
    const { rerender } = render({
      allOptionLabel: "All",
      value: "id-7",
      selectedOption: { id: "id-7", text: "Personal Visa" },
      clearable: true,
    });

    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    rerender(withProviders(view({ allOptionLabel: "All", value: null, clearable: true })));
    expect(field()).toHaveTextContent("Search cards");

    const trigger = field();
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "All" }));

    expect(trigger).toHaveTextContent("All");
  });

  // A list long enough to scroll has to say so. `ComboboxList` ships
  // shadcn's `no-scrollbar`, and only the standard properties undo it.
  it("lets the options list show its scrollbar", async () => {
    const user = userEvent.setup();
    render();

    await user.click(field());

    await waitFor(() => expect(screen.getByText("Item 0")).toBeInTheDocument());
    expect(document.querySelector('[data-slot="combobox-list"]')).toHaveClass(
      "[scrollbar-width:thin]",
    );
  });

  it("shows a magnifier in the search box once the results have settled", async () => {
    const user = userEvent.setup();
    render();

    await user.click(field());

    await waitFor(() =>
      expect(document.querySelector('[data-slot="async-combobox-search-icon"]')).toBeInTheDocument(),
    );
    expect(
      document.querySelector('[data-slot="async-combobox-loading-icon"]'),
    ).not.toBeInTheDocument();
  });

  it("swaps the magnifier for a spinner while a request is out", async () => {
    // Never resolves, so the fetching state is the one under assertion
    // rather than a race against the response.
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render();

    await user.click(field());

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="async-combobox-loading-icon"]'),
      ).toBeInTheDocument(),
    );
    expect(
      document.querySelector('[data-slot="async-combobox-search-icon"]'),
    ).not.toBeInTheDocument();
  });

  it("marks itself invalid for the form to describe", () => {
    render({ invalid: true });

    expect(field()).toHaveAttribute("aria-invalid", "true");
  });

  it("renders list rows through renderItem", async () => {
    const user = userEvent.setup();
    render({ renderItem: (item) => <span>Row: {item.text}</span> });

    await user.click(field());

    expect(await screen.findByText("Row: Item 0")).toBeInTheDocument();
  });

  it("renders the selected value through renderValue", () => {
    render({
      value: "id-7",
      selectedOption: { id: "id-7", text: "Personal Visa" },
      renderValue: (item) => <span>Card: {item.text}</span>,
    });

    expect(field()).toHaveTextContent("Card: Personal Visa");
  });

  it("clears the selection from the trigger when clearable", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({
      value: "id-7",
      selectedOption: { id: "id-7", text: "Personal Visa" },
      clearable: true,
      onValueChange,
    });

    await user.click(screen.getByRole("button", { name: "Clear selection" }));

    expect(onValueChange).toHaveBeenCalledWith(null);
  });

  it("hides the clear button while nothing is selected", () => {
    render({ clearable: true });

    expect(screen.queryByRole("button", { name: "Clear selection" })).not.toBeInTheDocument();
  });

  it("works with an item shape of its own, through the accessors", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [{ uuid: "u-1", nickname: "Nubank" }], hasMore: false }), {
          status: 200,
        }),
      ),
    );
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    renderWithIntl(
      <AsyncCombobox<{ uuid: string; nickname: string }>
        endpoint="/api/cards/options"
        getItemId={(item) => item.uuid}
        itemToLabel={(item) => item.nickname}
        value={null}
        onValueChange={onValueChange}
        placeholder="Search cards"
      />,
    );

    await user.click(field());
    await user.click(await screen.findByText("Nubank"));

    expect(onValueChange).toHaveBeenCalledWith("u-1");
  });
});
