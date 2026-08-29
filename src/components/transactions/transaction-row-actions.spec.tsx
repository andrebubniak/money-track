import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/transactions", () => ({ deleteTransaction: vi.fn() }));
vi.mock("@/lib/actions/recurring-transactions", () => ({ deleteRecurringTransaction: vi.fn() }));

import { deleteRecurringTransaction } from "@/lib/actions/recurring-transactions";
import { deleteTransaction } from "@/lib/actions/transactions";
import { renderWithIntl } from "@/test-utils/intl";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import type { TransactionListRow } from "@/lib/transactions/list-query";

const row = (overrides: Partial<TransactionListRow> = {}): TransactionListRow => ({
  kind: "single",
  id: "tx-1",
  planId: null,
  effectiveDate: "2026-08-14",
  startDate: null,
  description: "Groceries",
  type: "EXPENSE",
  amount: "120.50",
  paymentDate: null,
  categoryId: "cat-1",
  cardId: "card-1",
  frequency: null,
  seriesIndex: null,
  seriesTotal: null,
  ...overrides,
});

const openMenu = async (entry: TransactionListRow) => {
  const user = userEvent.setup();
  renderWithIntl(<TransactionRowActions row={entry} />);
  await user.click(screen.getByRole("button", { name: "Actions" }));
  return user;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(deleteTransaction).mockResolvedValue({ success: true });
  vi.mocked(deleteRecurringTransaction).mockResolvedValue({ success: true });
});

describe("TransactionRowActions", () => {
  it("edits a one-off on its own page", async () => {
    await openMenu(row());

    expect(await screen.findByRole("menuitem", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/tx-1/edit",
    );
  });

  it("edits an ongoing recurrence on the recurring page", async () => {
    await openMenu(row({ kind: "recurring", id: "rec-1" }));

    expect(await screen.findByRole("menuitem", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/recurring/rec-1/edit",
    );
  });

  // A generated occurrence has no page of its own: its Edit opens the plan,
  // pointed at that occurrence.
  it("edits an installment occurrence on its plan's page", async () => {
    await openMenu(row({ kind: "installment", id: "tx-9", planId: "plan-1" }));

    expect(await screen.findByRole("menuitem", { name: /Edit/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/installments/plan-1/edit?occurrence=tx-9",
    );
  });

  it("deletes a one-off through the transaction action", async () => {
    const user = await openMenu(row());

    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteTransaction).toHaveBeenCalledWith("tx-1", "en-US");
  });

  it("deletes a recurrence through the recurrence action", async () => {
    const user = await openMenu(row({ kind: "recurring", id: "rec-1" }));

    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteRecurringTransaction).toHaveBeenCalledWith("rec-1", "en-US");
  });

  // An occurrence is deleted from its plan's edit page, where its siblings
  // and the plan's total are on screen — never from the flat list.
  it("offers no delete for an installment row", async () => {
    await openMenu(row({ kind: "installment", id: "tx-9", planId: "plan-1" }));

    expect(await screen.findByRole("menuitem", { name: /Edit/ })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Delete/ })).not.toBeInTheDocument();
  });

  it("shows the action's error and keeps the dialog open", async () => {
    vi.mocked(deleteTransaction).mockResolvedValue({ success: false, error: "Nope." });
    const user = await openMenu(row());

    await user.click(await screen.findByRole("menuitem", { name: /Delete/ }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
  });
});
