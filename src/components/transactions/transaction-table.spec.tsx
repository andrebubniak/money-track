import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";

import { renderWithIntl } from "@/test-utils/intl";
import { TransactionTable } from "@/components/transactions/transaction-table";
import { parseTransactionFilters } from "@/lib/validations/transaction-filters";
import type { TransactionListRow } from "@/lib/transactions/list-query";

const TODAY = new Date("2026-08-16T00:00:00.000Z");

const row = (overrides: Partial<TransactionListRow> = {}): TransactionListRow => ({
  kind: "single",
  id: "tx-1",
  planId: null,
  effectiveDate: "2026-08-14",
  startDate: null,
  description: "Groceries",
  type: "EXPENSE",
  amount: "120.50",
  isPaid: true,
  categoryId: "cat-1",
  cardId: "card-1",
  frequency: null,
  seriesIndex: null,
  seriesTotal: null,
  ...overrides,
});

const render = (rows: TransactionListRow[], overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <TransactionTable
      rows={rows}
      categoryNames={{ "cat-1": "Food" }}
      cardNames={{ "card-1": "Personal Visa" }}
      preferences={{ currency: "USD", numberFormat: "COMMA_DOT", dateFormat: "MDY" }}
      filters={parseTransactionFilters({}, TODAY)}
      sortHrefs={{
        date: "/transactions?sort=date",
        amount: "/transactions?sort=amount",
        category: "/transactions?sort=category",
        description: "/transactions?sort=description",
      }}
      hasAnyTransactions
      clearHref="/transactions"
      {...overrides}
    />,
  );

describe("TransactionTable", () => {
  it("renders a one-off row with formatted date and amount", () => {
    render([row()]);

    expect(screen.getByText("08/14/2026")).toBeInTheDocument();
    expect(screen.getByText(/120\.50/)).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
    expect(screen.getByText("Personal Visa")).toBeInTheDocument();
  });

  it("signs an expense negative and income positive", () => {
    render([row(), row({ id: "tx-2", type: "INCOME", cardId: null, amount: "5000.00" })]);

    expect(screen.getByText(/−.*120\.50/)).toBeInTheDocument();
    expect(screen.getByText(/\+.*5,000\.00/)).toBeInTheDocument();
  });

  // An ongoing recurrence shows both dates so its fallback start date is
  // never mistaken for a charge that happened.
  it("shows a recurring row's start date alongside its effective date", () => {
    render([
      row({
        kind: "recurring",
        id: "rec-1",
        effectiveDate: "2026-05-12",
        startDate: "2024-09-12",
        frequency: "MONTHLY",
        description: "Netflix",
      }),
    ]);

    expect(screen.getByText("05/12/2026")).toBeInTheDocument();
    expect(screen.getByText("Started 09/12/2024")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
  });

  it("badges an installment occurrence with its position in the series", () => {
    render([
      row({
        kind: "installment",
        id: "tx-9",
        planId: "plan-1",
        seriesIndex: 3,
        seriesTotal: 12,
        startDate: "2026-01-05",
      }),
    ]);

    expect(screen.getByText("3 of 12")).toBeInTheDocument();
    // This row has a `startDate` too (every installment occurrence does),
    // but "Started …" is only ever meaningful for a collapsed recurring row
    // standing in for a whole series — an installment occurrence is a real
    // dated charge, not a fallback. A guard that keyed off `startDate` alone
    // instead of `kind === "recurring"` would show it here too.
    expect(screen.queryByText(/Started/)).toBeNull();
  });

  it("links each sortable header, and marks the active column", () => {
    render([row()]);

    expect(screen.getByRole("link", { name: /Date/ })).toHaveAttribute(
      "href",
      "/en-US/transactions?sort=date",
    );
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
    expect(screen.getByRole("columnheader", { name: /Amount/ })).toHaveAttribute(
      "aria-sort",
      "none",
    );
  });

  // Each sortable column must link to its own href — a mutation that pointed
  // every header at `sortHrefs.date` still passed every other test here,
  // since only Date's href was ever asserted.
  it("links every sortable header to its own href, not just Date's", () => {
    render([row()]);

    expect(screen.getByRole("link", { name: /Amount/ })).toHaveAttribute(
      "href",
      "/en-US/transactions?sort=amount",
    );
    expect(screen.getByRole("link", { name: /Category/ })).toHaveAttribute(
      "href",
      "/en-US/transactions?sort=category",
    );
    expect(screen.getByRole("link", { name: /Description/ })).toHaveAttribute(
      "href",
      "/en-US/transactions?sort=description",
    );
  });

  it("does not link the columns that cannot be sorted", () => {
    render([row()]);

    expect(
      within(screen.getByRole("columnheader", { name: "Card" })).queryByRole("link"),
    ).toBeNull();
  });

  // Two different empty states: nothing yet, versus nothing matching.
  it("invites a first transaction when the user has none", () => {
    render([], { hasAnyTransactions: false });

    expect(screen.getByText("You don't have any transactions yet.")).toBeInTheDocument();
  });

  it("offers to clear the filters when they are what emptied the list", () => {
    render([], { hasAnyTransactions: true });

    expect(screen.getByText("No transactions match these filters.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/en-US/transactions",
    );
  });
});
