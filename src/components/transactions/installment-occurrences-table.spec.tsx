import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";

vi.mock("@/lib/actions/transactions", () => ({
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

import { deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import { renderWithIntl } from "@/test-utils/intl";
import { InstallmentOccurrencesTable } from "@/components/transactions/installment-occurrences-table";
import enUS from "../../../messages/en-US.json";

const occurrences = [
  { id: "tx-1", index: 1, date: "2026-01-05", amount: "89.00", description: "Gym", isPaid: true },
  { id: "tx-2", index: 2, date: "2026-02-05", amount: "89.00", description: "Gym", isPaid: false },
  { id: "tx-3", index: 3, date: "2026-03-05", amount: "89.00", description: "Gym", isPaid: false },
];

const seriesValues = { type: "EXPENSE" as const, categoryId: "cat-1", cardId: "card-1" };

const render = (overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <InstallmentOccurrencesTable
      planId="plan-1"
      occurrences={occurrences}
      occurrencesCount={3}
      seriesValues={seriesValues}
      dateFormat="MDY"
      focusOccurrenceId={null}
      {...overrides}
    />,
  );

// `renderWithIntl`'s own `rerender` (from `@testing-library/react`) expects
// the full tree it mounted, provider included, or the update would replace
// the provider itself rather than diff against the existing one — so
// rerendering with new props re-wraps the same way `render` above does,
// instead of passing `InstallmentOccurrencesTable` alone.
const rerenderWithNewProps = (
  rerender: (ui: ReactElement) => void,
  overrides: Record<string, unknown>,
) =>
  rerender(
    <NextIntlClientProvider locale="en-US" messages={enUS}>
      <InstallmentOccurrencesTable
        planId="plan-1"
        occurrences={occurrences}
        occurrencesCount={3}
        seriesValues={seriesValues}
        dateFormat="MDY"
        focusOccurrenceId={null}
        {...overrides}
      />
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateTransaction).mockResolvedValue({ success: true });
  vi.mocked(deleteTransaction).mockResolvedValue({ success: true });
});

describe("InstallmentOccurrencesTable", () => {
  it("renders one editable row per occurrence, numbered", () => {
    render();

    // Three rows plus the header.
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(3);
  });

  // Per-occurrence edits are the point of this table; one row's Save must
  // not carry another row's values.
  it("saves only the edited row's values", async () => {
    const user = userEvent.setup();
    render();

    const secondRow = screen.getAllByRole("row")[2];
    // `fireEvent.change`, not `user.clear`/`user.type`: jsdom's <input
    // type="number"> rejects the momentarily-invalid "95." it would pass
    // through mid-keystroke (no digit yet after the decimal point) and
    // silently drops the rest of the value — reproducible with a bare,
    // component-free `<input type="number">`, so it is a jsdom/user-event
    // gap, not something this component can work around. Setting the final
    // value in one commit sidesteps the invalid intermediate state entirely.
    fireEvent.change(within(secondRow).getByRole("spinbutton"), { target: { value: "95.00" } });
    await user.click(within(secondRow).getByRole("button", { name: "Save" }));

    expect(updateTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateTransaction).mock.calls[0][0]).toBe("tx-2");
    expect(vi.mocked(updateTransaction).mock.calls[0][1].amount).toBe("95.00");
  });

  // The occurrence carries the series' classification unchanged, so a
  // per-row save cannot silently reclassify it.
  it("submits the series' category, card, and type unchanged", async () => {
    const user = userEvent.setup();
    render();

    const firstRow = screen.getAllByRole("row")[1];
    await user.click(within(firstRow).getByRole("button", { name: "Save" }));

    expect(vi.mocked(updateTransaction).mock.calls[0][1]).toMatchObject({
      type: "EXPENSE",
      categoryId: "cat-1",
      cardId: "card-1",
    });
  });

  it("marks an occurrence paid", async () => {
    const user = userEvent.setup();
    render();

    const secondRow = screen.getAllByRole("row")[2];
    await user.click(within(secondRow).getByRole("checkbox"));
    await user.click(within(secondRow).getByRole("button", { name: "Save" }));

    expect(vi.mocked(updateTransaction).mock.calls[0][1].isPaid).toBe(true);
  });

  it("deletes a single occurrence without touching the others", async () => {
    const user = userEvent.setup();
    render();

    const secondRow = screen.getAllByRole("row")[2];
    await user.click(within(secondRow).getByRole("button", { name: "Delete payment" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deleteTransaction).mock.calls[0][0]).toBe("tx-2");
  });

  // Regression coverage: numbering must come from each occurrence's own
  // stable `index` (its position when created), never from this table's own
  // visible row order — otherwise deleting an earlier occurrence renumbers
  // every later one here while the list (which numbers the same stable way)
  // keeps showing their original positions, disagreeing with this table.
  it("keeps a remaining occurrence's original position after an earlier one is deleted", async () => {
    const user = userEvent.setup();
    render();

    const firstRow = screen.getAllByRole("row")[1];
    await user.click(within(firstRow).getByRole("button", { name: "Delete payment" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    // tx-1 (index 1) is gone; tx-3 keeps "3 of 3", not renumbered to "2 of 3".
    expect(screen.queryByText("1 of 3")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
    expect(screen.getByText("3 of 3")).toBeInTheDocument();
  });

  // Per-row state, not one flag for the table: saving two rows in sequence
  // must not blank the first row's feedback.
  it("keeps each row's saved state separate", async () => {
    const user = userEvent.setup();
    render();

    const rows = screen.getAllByRole("row");
    await user.click(within(rows[1]).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    await user.click(within(rows[2]).getByRole("button", { name: "Save" }));

    expect(await screen.findAllByText("Saved")).toHaveLength(2);
  });

  it("focuses the occurrence named by the query param", () => {
    render({ focusOccurrenceId: "tx-3" });

    expect(screen.getAllByRole("spinbutton")[2]).toHaveFocus();
  });

  // In this design a ref only ever exists for an id that came from
  // `occurrences` in the first place, so a genuinely foreign id already
  // finds no ref to call `.focus()` on regardless of the explicit
  // membership check — this test cannot distinguish "guard present" from
  // "guard removed" (see the fix-round note in the task report). Kept as
  // a regression test for the observable behaviour either way: a query
  // param naming no row in this plan must never move focus.
  it("ignores an occurrence id that is not in this plan", () => {
    render({ focusOccurrenceId: "not-mine" });

    expect(document.body).toHaveFocus();
  });

  // The page keeps this table mounted across a `router.refresh()` (the
  // series form triggers one on save without navigating away), so a prop
  // update for an occurrence already on screen must overwrite whatever
  // stale value is showing — otherwise a later Save on that row would
  // silently write the stale value back over a change made elsewhere.
  it("resyncs a row's displayed values when its server data changes underneath it", () => {
    const { rerender } = render();

    const secondRow = screen.getAllByRole("row")[2];
    expect(within(secondRow).getByRole("spinbutton")).toHaveValue(89);
    expect(within(secondRow).getByRole("checkbox")).not.toBeChecked();

    const updatedOccurrences = occurrences.map((occurrence) =>
      occurrence.id === "tx-2" ? { ...occurrence, amount: "150.00", isPaid: true } : occurrence,
    );
    rerenderWithNewProps(rerender, { occurrences: updatedOccurrences });

    const secondRowAfter = screen.getAllByRole("row")[2];
    expect(within(secondRowAfter).getByRole("spinbutton")).toHaveValue(150);
    expect(within(secondRowAfter).getByRole("checkbox")).toBeChecked();
  });

  // The resync above must not clobber a row nobody else touched: only the
  // row whose server data actually changed should reset.
  it("leaves an untouched row alone when a different row's server data changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render();

    const firstRow = screen.getAllByRole("row")[1];
    fireEvent.change(within(firstRow).getByRole("spinbutton"), { target: { value: "999.00" } });

    const updatedOccurrences = occurrences.map((occurrence) =>
      occurrence.id === "tx-2" ? { ...occurrence, amount: "150.00" } : occurrence,
    );
    rerenderWithNewProps(rerender, { occurrences: updatedOccurrences });

    const firstRowAfter = screen.getAllByRole("row")[1];
    expect(within(firstRowAfter).getByRole("spinbutton")).toHaveValue(999);

    await user.click(within(firstRowAfter).getByRole("button", { name: "Save" }));
    expect(vi.mocked(updateTransaction).mock.calls[0][1].amount).toBe("999.00");
  });
});
