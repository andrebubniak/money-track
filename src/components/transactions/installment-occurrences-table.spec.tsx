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
        today="2026-08-19"
        dateFormat="MDY"
        numberFormat="COMMA_DOT"
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
    const amount = within(secondRow).getByRole("textbox", { name: "Payment 2 amount" });
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

    expect(screen.getByRole("textbox", { name: "Payment 1 amount" })).toHaveValue("89,00");
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

    expect(screen.getByRole("textbox", { name: "Payment 3 amount" })).toHaveFocus();
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
    expect(within(secondRow).getByRole("textbox", { name: "Payment 2 amount" })).toHaveValue(
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
    expect(within(secondRowAfter).getByRole("textbox", { name: "Payment 2 amount" })).toHaveValue(
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
    fireEvent.change(within(firstRow).getByRole("textbox", { name: "Payment 1 amount" }), {
      target: { value: "999.00" },
    });

    const updatedOccurrences = occurrences.map((occurrence) =>
      occurrence.id === "tx-2" ? { ...occurrence, amount: "150.00" } : occurrence,
    );
    rerenderWithNewProps(rerender, { occurrences: updatedOccurrences });

    const firstRowAfter = screen.getAllByRole("row")[1];
    expect(within(firstRowAfter).getByRole("textbox", { name: "Payment 1 amount" })).toHaveValue(
      "999.00",
    );

    await user.click(within(firstRowAfter).getByRole("button", { name: "Save" }));
    expect(vi.mocked(updateTransaction).mock.calls[0][1].amount).toBe("999.00");
  });
});
