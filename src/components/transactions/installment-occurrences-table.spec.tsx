import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/transactions", () => ({
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

import { deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import { renderWithIntl, withProviders } from "@/test-utils/intl";
import { InstallmentOccurrencesTable } from "@/components/transactions/installment-occurrences-table";

const occurrences = [
  { id: "tx-1", index: 1, date: "2026-01-05", amount: "89.00", paymentDate: "2026-01-05" },
  { id: "tx-2", index: 2, date: "2026-02-05", amount: "89.00", paymentDate: null },
  { id: "tx-3", index: 3, date: "2026-03-05", amount: "89.00", paymentDate: null },
];

const seriesValues = {
  type: "EXPENSE" as const,
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Gym",
};

const render = (overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <InstallmentOccurrencesTable
      planId="plan-1"
      occurrences={occurrences}
      occurrencesCount={3}
      seriesValues={seriesValues}
      today="2026-08-19"
      dateFormat="MDY"
      numberFormat="COMMA_DOT"
      focusOccurrenceId={null}
      {...overrides}
    />,
  );

// `renderWithIntl`'s own `rerender` (from `@testing-library/react`) expects
// the full tree it mounted, providers included, or the update would replace
// them rather than diff against the existing ones — so rerendering with new
// props re-wraps the same way `render` above does, instead of passing
// `InstallmentOccurrencesTable` alone.
const rerenderWithNewProps = (
  rerender: (ui: ReactElement) => void,
  overrides: Record<string, unknown>,
) =>
  rerender(
    withProviders(
      <InstallmentOccurrencesTable
        planId="plan-1"
        occurrences={occurrences}
        occurrencesCount={3}
        seriesValues={seriesValues}
        today="2026-08-19"
        dateFormat="MDY"
        numberFormat="COMMA_DOT"
        focusOccurrenceId={null}
        {...overrides}
      />,
    ),
  );

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * Drives one row's date picker the way a user does: open the trigger, page
 * to the month, click the day. `DatePicker` opens on the value it currently
 * holds, so the target month can be either side of it — the direction is
 * read back off the caption rather than assumed, and the loop is bounded so
 * a wrong assumption fails the test instead of hanging it.
 *
 * Days are clicked by their full accessible name — react-day-picker names a
 * day button with the whole formatted date, and a bare "1" would also match
 * the 11th and the 21st.
 */
async function setRowDate(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  iso: string,
) {
  const [year, month, day] = iso.split("-").map(Number);
  const targetCaption = `${MONTH_NAMES[month - 1]} ${year}`;

  await user.click(screen.getByRole("button", { name: `Payment ${index} date` }));

  for (let step = 0; step < 36; step += 1) {
    const caption = document.querySelector(".rdp-caption_label")?.textContent?.trim() ?? "";
    if (caption === targetCaption) break;

    const [shownMonth, shownYear] = caption.split(" ");
    const shown = Number(shownYear) * 12 + MONTH_NAMES.indexOf(shownMonth);
    const target = year * 12 + (month - 1);

    await user.click(
      screen.getByRole("button", {
        name: target < shown ? "Go to the Previous Month" : "Go to the Next Month",
      }),
    );
  }

  await user.click(
    await screen.findByRole("button", {
      name: new RegExp(`${MONTH_NAMES[month - 1]} ${day}(st|nd|rd|th), ${year}`),
    }),
  );
}

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
    const amount = within(secondRow).getByRole("textbox", { name: "Payment 2 value" });
    // Keystroke by keystroke, which the masked field handles: it derives its
    // display from a digit string, so there is no free-form "." or trailing
    // "0" for a re-render to drop mid-edit — the hazard the old, uncontrolled
    // number input existed to avoid.
    await user.clear(amount);
    await user.type(amount, "9500");
    await user.click(within(secondRow).getByRole("button", { name: "Save" }));

    expect(updateTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateTransaction).mock.calls[0][0]).toBe("tx-2");
    expect(vi.mocked(updateTransaction).mock.calls[0][1].amount).toBe("95.00");
  });

  // The masked field shows the user's stored `NumberFormat`, never the UI
  // language's conventions — see `money-input.tsx`.
  it("masks each amount with the user's number format", () => {
    render({ numberFormat: "DOT_COMMA" });

    expect(screen.getByRole("textbox", { name: "Payment 1 value" })).toHaveValue("89,00");
  });

  // Description classifies the whole plan, so it is edited once in the
  // series form above rather than repeated on every row here.
  it("has no per-occurrence description field", () => {
    render();

    expect(screen.queryByRole("columnheader", { name: "Description" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /description/i })).not.toBeInTheDocument();
  });

  // The series description rides along on every per-row save, the same way
  // category, card, and type do.
  it("submits the series' description unchanged", async () => {
    const user = userEvent.setup();
    render();

    const firstRow = screen.getAllByRole("row")[1];
    await user.click(within(firstRow).getByRole("button", { name: "Save" }));

    expect(vi.mocked(updateTransaction).mock.calls[0][1].description).toBe("Gym");
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

  // Paid-ness is shown, not toggled: the cell reads the stored payment date,
  // and a row with none reads "Not paid".
  it("shows each occurrence's payment date, or a not-paid badge", () => {
    render();

    const rows = screen.getAllByRole("row");
    // index, Date, Value, Payment date, Actions.
    expect(within(rows[1]).getAllByRole("cell")[3]).toHaveTextContent("01/05/2026");
    expect(within(rows[1]).queryByText("Not paid")).not.toBeInTheDocument();
    expect(within(rows[2]).getAllByRole("cell")[3]).toHaveTextContent("Not paid");
    expect(screen.getAllByText("Not paid")).toHaveLength(2);
  });

  it("has no paid checkbox any more", () => {
    render();

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("marks an occurrence paid from the row action", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Payment 2 mark as paid" }));
    await user.click(await screen.findByRole("button", { name: "Mark as paid" }));
    await user.click(within(screen.getAllByRole("row")[2]).getByRole("button", { name: "Save" }));

    expect(updateTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateTransaction).mock.calls[0][0]).toBe("tx-2");
    expect(vi.mocked(updateTransaction).mock.calls[0][1].paymentDate).toBe("2026-02-05");
  });

  // Regression coverage for the bug this row action exists to fix. A plan's
  // occurrences are generated into the future by design, but
  // `createTransactionSchema` caps `paymentDate` at today — so the old
  // checkbox, which seeded `paymentDate` from the row's own date, failed
  // validation on every future-dated row (11 of 12 in a fresh yearly plan)
  // and never reached the server at all. The ceiling is the *earlier* of
  // today and the occurrence's own date, which is always satisfiable.
  it("caps the payment date at today for a future-dated occurrence", async () => {
    const user = userEvent.setup();
    render({
      occurrences: [
        { id: "tx-future", index: 1, date: "2026-12-05", amount: "89.00", paymentDate: null },
      ],
      occurrencesCount: 1,
    });

    await user.click(screen.getByRole("button", { name: "Payment 1 mark as paid" }));
    await user.click(await screen.findByRole("button", { name: "Mark as paid" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Reached the server at all — the old checkbox never did, because the
    // schema rejected the future payment date before the action was called.
    expect(updateTransaction).toHaveBeenCalledTimes(1);
    const { paymentDate } = vi.mocked(updateTransaction).mock.calls[0][1];
    expect(paymentDate).toBe("2026-08-19");
    expect(paymentDate! <= "2026-08-19").toBe(true);
    // The cap belongs on `paymentDate` alone: the occurrence's own future
    // date must still go through untouched.
    expect(vi.mocked(updateTransaction).mock.calls[0][1].date).toBe("2026-12-05");
  });

  // The other half of the ceiling: for an occurrence already in the past, a
  // payment cannot postdate the occurrence it settles.
  it("caps the payment date picker at the occurrence's own date", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Payment 1 mark as paid" }));
    await user.click(await screen.findByRole("button", { name: "Payment 1 payment date" }));

    // Full accessible names, not bare day numbers — react-day-picker names a
    // day button with the whole formatted date, and "6" would also match
    // the 16th and the 26th.
    expect(await screen.findByRole("button", { name: /January 5th, 2026/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /January 6th, 2026/ })).toBeDisabled();
  });

  it("marks a paid occurrence unpaid from the same dialog", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Payment 1 mark as paid" }));
    await user.click(await screen.findByRole("button", { name: "Mark as unpaid" }));
    await user.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Save" }));

    expect(vi.mocked(updateTransaction).mock.calls[0][1].paymentDate).toBeNull();
  });

  // The dialog must open showing the value it is about to replace. This
  // fixture is the case that distinguishes the two seeding rules: paid on
  // the 2nd, dated the 5th, so the stored day and the ceiling differ.
  it("seeds the dialog with the stored payment date, not the ceiling", async () => {
    const user = userEvent.setup();
    render({
      occurrences: [
        { id: "tx-early", index: 1, date: "2026-01-05", amount: "89.00", paymentDate: "2026-01-02" },
      ],
      occurrencesCount: 1,
    });

    await user.click(screen.getByRole("button", { name: "Payment 1 mark as paid" }));

    expect(await screen.findByRole("button", { name: "Payment 1 payment date" })).toHaveTextContent(
      "01/02/2026",
    );
  });

  // The harm the rule above prevents: reopening a paid row and confirming
  // without touching the picker must be a no-op, not a silent rewrite of a
  // stored date the user never saw.
  it("does not rewrite a stored payment date when the dialog is confirmed unchanged", async () => {
    const user = userEvent.setup();
    render({
      occurrences: [
        { id: "tx-early", index: 1, date: "2026-01-05", amount: "89.00", paymentDate: "2026-01-02" },
      ],
      occurrencesCount: 1,
    });

    await user.click(screen.getByRole("button", { name: "Payment 1 mark as paid" }));
    await user.click(await screen.findByRole("button", { name: "Mark as paid" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(vi.mocked(updateTransaction).mock.calls[0][1].paymentDate).toBe("2026-01-02");
  });

  // The other direction of the same rule: with nothing stored there is
  // nothing to show, so the ceiling is the sensible default.
  it("seeds the dialog with the ceiling when the occurrence is not paid", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Payment 2 mark as paid" }));

    expect(await screen.findByRole("button", { name: "Payment 2 payment date" })).toHaveTextContent(
      "02/05/2026",
    );
  });

  // An unpaid row has nothing to clear, so the dialog does not offer it.
  it("offers no unpaid button for an occurrence that is not paid", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Payment 2 mark as paid" }));
    await screen.findByRole("button", { name: "Mark as paid" });

    expect(screen.queryByRole("button", { name: "Mark as unpaid" })).not.toBeInTheDocument();
  });

  // The dialog edits the row's draft only, exactly as its date and amount
  // fields do — the row's own Save is still what persists it.
  it("does not save the row when the dialog is confirmed", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Payment 2 mark as paid" }));
    await user.click(await screen.findByRole("button", { name: "Mark as paid" }));

    expect(updateTransaction).not.toHaveBeenCalled();
    expect(within(screen.getAllByRole("row")[2]).getAllByRole("cell")[3]).toHaveTextContent(
      "02/05/2026",
    );
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

    expect(screen.getByRole("textbox", { name: "Payment 3 value" })).toHaveFocus();
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
    expect(within(secondRow).getByRole("textbox", { name: "Payment 2 value" })).toHaveValue(
      "89.00",
    );
    expect(within(secondRow).getAllByRole("cell")[3]).toHaveTextContent("Not paid");

    const updatedOccurrences = occurrences.map((occurrence) =>
      occurrence.id === "tx-2"
        ? { ...occurrence, amount: "150.00", paymentDate: "2026-02-05" }
        : occurrence,
    );
    rerenderWithNewProps(rerender, { occurrences: updatedOccurrences });

    const secondRowAfter = screen.getAllByRole("row")[2];
    expect(within(secondRowAfter).getByRole("textbox", { name: "Payment 2 value" })).toHaveValue(
      "150.00",
    );
    expect(within(secondRowAfter).getAllByRole("cell")[3]).toHaveTextContent("02/05/2026");
  });

  // The resync above must not clobber a row nobody else touched: only the
  // row whose server data actually changed should reset.
  it("leaves an untouched row alone when a different row's server data changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render();

    const firstRow = screen.getAllByRole("row")[1];
    fireEvent.change(within(firstRow).getByRole("textbox", { name: "Payment 1 value" }), {
      target: { value: "999.00" },
    });

    const updatedOccurrences = occurrences.map((occurrence) =>
      occurrence.id === "tx-2" ? { ...occurrence, amount: "150.00" } : occurrence,
    );
    rerenderWithNewProps(rerender, { occurrences: updatedOccurrences });

    const firstRowAfter = screen.getAllByRole("row")[1];
    expect(within(firstRowAfter).getByRole("textbox", { name: "Payment 1 value" })).toHaveValue(
      "999.00",
    );

    await user.click(within(firstRowAfter).getByRole("button", { name: "Save" }));
    expect(vi.mocked(updateTransaction).mock.calls[0][1].amount).toBe("999.00");
  });

  // A plan's payments are a series: dragging one before the row above it
  // leaves the whole plan out of order, so the table refuses to let any row
  // be committed until the chain is whole again.
  it("flags a row dated before the one above it and blocks every save", async () => {
    const user = userEvent.setup();
    render();

    // Occurrence 2 is 2026-02-05; move it before occurrence 1's 2026-01-05.
    await setRowDate(user, 2, "2025-12-01");

    expect(screen.getByText(/Payments must stay in order/)).toBeInTheDocument();
    // Every Save, not just the offending row's: a per-row block would let a
    // user commit half a reshuffle and navigate away out of order.
    for (const save of screen.getAllByRole("button", { name: "Save" })) {
      expect(save).toBeDisabled();
    }
  });

  it("clears the block once the order is restored", async () => {
    const user = userEvent.setup();
    render();

    await setRowDate(user, 2, "2025-12-01");
    expect(screen.getByText(/Payments must stay in order/)).toBeInTheDocument();

    await setRowDate(user, 2, "2026-02-05");

    expect(screen.queryByText(/Payments must stay in order/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Save" })[0]).toBeEnabled();
  });

  // The other half of the same check, and the one the schema already
  // rejects on save (`paymentDate.afterDate`): surfacing it in the table is
  // what stops the user finding out only after clicking Save.
  it("flags a payment date later than its own occurrence date", async () => {
    render({
      occurrences: occurrences.map((o) =>
        o.id === "tx-1" ? { ...o, paymentDate: "2026-01-06" } : o,
      ),
    });

    expect(screen.getByText(/Payments must stay in order/)).toBeInTheDocument();
  });

  // Anchored on the immediately previous row, never on the greatest date
  // seen so far — that is what makes this agree exactly with the rule
  // `updateTransaction` enforces. In [Mar, Jan, Feb] only the Jan row breaks
  // it; Feb is still on or after the Jan above it.
  it("flags only the row that falls behind its immediate predecessor", async () => {
    render({
      occurrences: [
        { id: "tx-1", index: 1, date: "2026-03-05", amount: "89.00", paymentDate: null },
        { id: "tx-2", index: 2, date: "2026-01-05", amount: "89.00", paymentDate: null },
        { id: "tx-3", index: 3, date: "2026-02-05", amount: "89.00", paymentDate: null },
      ],
    });

    expect(screen.getByRole("button", { name: "Payment 1 date" })).not.toHaveAttribute(
      "aria-invalid",
    );
    expect(screen.getByRole("button", { name: "Payment 2 date" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Payment 3 date" })).not.toHaveAttribute(
      "aria-invalid",
    );
  });

  // "Previous" means the previous *visible* row: a locally deleted
  // occurrence is hidden rather than removed from the prop, and must not go
  // on anchoring the row below it.
  it("ignores a deleted occurrence when deciding what the previous row is", async () => {
    const user = userEvent.setup();
    render({
      occurrences: [
        { id: "tx-1", index: 1, date: "2026-01-05", amount: "89.00", paymentDate: null },
        { id: "tx-2", index: 2, date: "2026-06-05", amount: "89.00", paymentDate: null },
        { id: "tx-3", index: 3, date: "2026-03-05", amount: "89.00", paymentDate: null },
      ],
    });

    expect(screen.getByText(/Payments must stay in order/)).toBeInTheDocument();

    const secondRow = screen.getAllByRole("row")[2];
    await user.click(within(secondRow).getByRole("button", { name: "Delete payment" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(screen.queryByText(/Payments must stay in order/)).not.toBeInTheDocument();
  });
});
