import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/navigation")>("@/i18n/navigation");
  return { ...actual, useRouter: () => ({ push, replace: push, refresh: vi.fn() }) };
});

import { renderWithIntl, withProviders } from "@/test-utils/intl";
import { TransactionFiltersPanel } from "@/components/transactions/transaction-filters";
import { parseTransactionFilters } from "@/lib/validations/transaction-filters";

const TODAY = new Date("2026-08-16T00:00:00.000Z");

function panel(params: Record<string, string> = {}) {
  return (
    <TransactionFiltersPanel
      filters={parseTransactionFilters(params, TODAY)}
      today="2026-08-16"
      dateFormat="MDY"
      selectedCategory={null}
      selectedCard={null}
    />
  );
}

const render = (params: Record<string, string> = {}) => renderWithIntl(panel(params));

/**
 * Wraps `panel(params)` the same way `renderWithIntl` does, for use with
 * `rerender` — `rerender` replaces the whole previously-rendered tree, so it
 * needs the same providers around it, not just the bare component.
 */
function rerenderPanel(params: Record<string, string> = {}) {
  return withProviders(panel(params));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"items":[],"hasMore":false}'))));
});

describe("TransactionFiltersPanel", () => {
  it("starts collapsed", async () => {
    render();

    expect(screen.queryByLabelText("Show")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Filters/ }));
    expect(screen.getByLabelText("Show")).toBeInTheDocument();
  });

  it("keeps the filters collapsed until the header bar is clicked", async () => {
    const user = userEvent.setup();
    render();

    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    expect(screen.getByLabelText("Category")).toBeInTheDocument();
  });

  it("badges how many filters differ from the defaults", () => {
    render({ type: "INCOME", show: "single" });

    expect(screen.getByText("2 active")).toBeInTheDocument();
  });

  it("shows no badge when nothing is filtered", () => {
    render();

    expect(screen.queryByText(/active/)).not.toBeInTheDocument();
  });

  // Nothing refetches until Apply: picking a period would otherwise fire
  // three navigations while the user chooses two dates.
  it("does not navigate while controls change", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByLabelText("Show"));
    await user.click(await screen.findByRole("option", { name: "One-off only" }));

    expect(push).not.toHaveBeenCalled();
  });

  it("navigates on Apply, and resets to page 1", async () => {
    const user = userEvent.setup();
    render({ page: "5" });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByLabelText("Show"));
    await user.click(await screen.findByRole("option", { name: "Recurring only" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(push).toHaveBeenCalledWith("/transactions?show=recurring");
  });

  // The panel's `draft` state is seeded once from the `filters` prop on
  // mount, and this same component instance stays mounted across a client
  // navigation (sorting is a plain link outside this panel, not a remount).
  // `rerender` with a new `filters` prop reproduces exactly that: the sort
  // changes underneath the panel while `draft` is left holding the old
  // value. Regression coverage for a bug where Apply always wrote `draft`'s
  // stale `sort`/`dir` back out, silently reverting whatever sort was active
  // the moment Apply was pressed.
  it("keeps the active sort and direction when applying a filter", async () => {
    const user = userEvent.setup();
    const { rerender } = render();

    // Simulates clicking a "Sort by amount" column header: the URL (and so
    // the `filters` prop) changes to sort=amount&dir=asc without the panel
    // ever unmounting.
    rerender(rerenderPanel({ sort: "amount", dir: "asc" }));

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByLabelText("Show"));
    await user.click(await screen.findByRole("option", { name: "Recurring only" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(push).toHaveBeenCalledWith("/transactions?show=recurring&sort=amount&dir=asc");
  });

  it("clears to the bare path", async () => {
    const user = userEvent.setup();
    render({ type: "INCOME", show: "single", page: "3" });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(push).toHaveBeenCalledWith("/transactions");
  });

  // `DatePicker`'s trigger sets its own `aria-label`, which wins over an
  // external `<Label htmlFor>` in accessible-name computation — without a
  // distinguishing name, a screen reader announces both triggers identically.
  it("gives the From and To date triggers distinct accessible names", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    expect(screen.getByRole("button", { name: "From" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "To" })).toBeInTheDocument();
  });

  it("shows the 'All' label in the type trigger when no type is filtered", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    expect(screen.getByLabelText("Type")).toHaveTextContent("All");
  });

  it("shows the selected type's label, not its enum value", async () => {
    const user = userEvent.setup();
    render({ type: "EXPENSE" });

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    expect(screen.getByLabelText("Type")).toHaveTextContent("Expense");
    expect(screen.getByLabelText("Type")).not.toHaveTextContent("EXPENSE");
  });

  it("shows the show filter's label, not its raw value", async () => {
    const user = userEvent.setup();
    render({ show: "recurring" });

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    expect(screen.getByLabelText("Show")).toHaveTextContent("Recurring only");
    expect(screen.getByLabelText("Show")).not.toHaveTextContent("recurring only");
  });
});
