import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/recurring-transactions", () => ({
  createRecurringTransaction: vi.fn(),
  updateRecurringTransaction: vi.fn(),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/navigation")>("@/i18n/navigation");
  return { ...actual, useRouter: () => ({ replace, refresh, push: vi.fn() }) };
});

import { createRecurringTransaction, updateRecurringTransaction } from "@/lib/actions/recurring-transactions";
import { renderWithIntl } from "@/test-utils/intl";
import { RecurringTransactionForm } from "@/components/transactions/recurring-transaction-form";
import type { RecurringTransactionValues } from "@/lib/validations/recurring-transaction";

const values: RecurringTransactionValues = {
  type: "EXPENSE",
  amount: "19.90",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Netflix",
  startDate: "2026-01-05",
  frequency: "MONTHLY",
};

const render = (overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <RecurringTransactionForm
      mode="create"
      defaultValues={values}
      today="2026-08-19"
      dateFormat="MDY"
      numberFormat="COMMA_DOT"
      selectedCategory={{ id: "cat-1", name: "Food" }}
      selectedCard={{ id: "card-1", name: "Personal Visa" }}
      {...overrides}
    />,
  );

const submit = (user: ReturnType<typeof userEvent.setup>, name = "Create transaction") =>
  user.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createRecurringTransaction).mockResolvedValue({ success: true });
  vi.mocked(updateRecurringTransaction).mockResolvedValue({ success: true });
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"items":[],"hasMore":false}'))));
});

describe("RecurringTransactionForm", () => {
  it("offers all seven frequencies, labelled from the catalogue", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByLabelText(/Repeats/));

    for (const label of [
      "Daily",
      "Weekly",
      "Every two weeks",
      "Monthly",
      "Quarterly",
      "Twice a year",
      "Yearly",
    ]) {
      expect(await screen.findByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  // An ongoing recurrence has no end and generates nothing here, so neither
  // control belongs on this form.
  it("has no paid checkbox and no payment count", () => {
    render();

    expect(screen.queryByLabelText("Already paid")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Number of payments/)).not.toBeInTheDocument();
  });

  it("asks for a start date rather than a date", () => {
    render();

    expect(screen.getByLabelText(/Start date/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Date/)).not.toBeInTheDocument();
  });

  it("states that occurrences are not generated yet", () => {
    render();

    expect(
      screen.getByText(
        "This defines the recurrence. Its transactions aren't created yet — that arrives with automatic generation.",
      ),
    ).toBeInTheDocument();
  });

  it("hides and clears the card on Income", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));
    await submit(user);

    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
    expect(vi.mocked(createRecurringTransaction).mock.calls[0][0].cardId).toBeNull();
  });

  it("shows the schema's message when the start date is out of range", async () => {
    const user = userEvent.setup();
    render({ defaultValues: { ...values, startDate: "1999-12-31" } });

    await submit(user);

    expect(
      await screen.findByText("Date must be between 2000-01-01 and 2100-12-31."),
    ).toBeInTheDocument();
    expect(createRecurringTransaction).not.toHaveBeenCalled();
  });

  it("passes the values and the active locale to the action", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(vi.mocked(createRecurringTransaction).mock.calls[0][0]).toMatchObject({
      frequency: "MONTHLY",
      startDate: "2026-01-05",
      amount: "19.90",
    });
    expect(vi.mocked(createRecurringTransaction).mock.calls[0][1]).toBe("en-US");
  });

  it("calls updateRecurringTransaction with the id in edit mode", async () => {
    const user = userEvent.setup();
    render({ mode: "edit", recurringTransactionId: "rec-1" });

    await submit(user, "Save changes");

    expect(vi.mocked(updateRecurringTransaction).mock.calls[0][0]).toBe("rec-1");
    expect(createRecurringTransaction).not.toHaveBeenCalled();
  });

  it("renders the action's error rather than navigating", async () => {
    vi.mocked(createRecurringTransaction).mockResolvedValue({ success: false, error: "Nope." });
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("caps the start date at today", async () => {
    const user = userEvent.setup();
    // The default startDate ("2026-01-05") would open the calendar on
    // January, where an August maxDate has no day buttons to assert on —
    // moving startDate onto today's own month keeps the two in view together.
    render({ defaultValues: { ...values, startDate: "2026-08-19" } });

    await user.click(screen.getByRole("button", { name: "Start date" }));

    expect(screen.getByRole("button", { name: /August 19th, 2026/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /August 20th, 2026/ })).toBeDisabled();
  });

  it("labels the amount field Value", () => {
    render();

    // "Value" is required, so its <Label> carries a trailing "*" that is
    // aria-hidden but still part of the label's raw text content — an exact
    // getByLabelText("Value") would not match "Value*". getByRole respects
    // aria-hidden when computing the accessible name — see `.claude/rules/ui.md`.
    expect(screen.getByRole("textbox", { name: "Value" })).toBeInTheDocument();
  });
});
