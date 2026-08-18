import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/transactions", () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/navigation")>("@/i18n/navigation");
  return { ...actual, useRouter: () => ({ replace, refresh, push: vi.fn() }) };
});

import { createTransaction, updateTransaction } from "@/lib/actions/transactions";
import { renderWithIntl } from "@/test-utils/intl";
import { TransactionForm } from "@/components/transactions/transaction-form";
import type { TransactionValues } from "@/lib/validations/transaction";

const values: TransactionValues = {
  type: "EXPENSE",
  amount: "120.50",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Groceries",
  date: "2026-08-14",
  isPaid: false,
};

const render = (overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <TransactionForm
      mode="create"
      defaultValues={values}
      dateFormat="MDY"
      selectedCategory={{ id: "cat-1", name: "Food" }}
      selectedCard={{ id: "card-1", name: "Personal Visa" }}
      {...overrides}
    />,
  );

const submit = (user: ReturnType<typeof userEvent.setup>, name = "Create transaction") =>
  user.click(screen.getByRole("button", { name }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createTransaction).mockResolvedValue({ success: true });
  vi.mocked(updateTransaction).mockResolvedValue({ success: true });
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"items":[],"hasMore":false}'))));
});

describe("TransactionForm", () => {
  it("defaults a new transaction to Expense", () => {
    render({ defaultValues: { ...values, type: "EXPENSE" } });

    expect(screen.getByRole("radio", { name: "Expense" })).toBeChecked();
  });

  // The test above renders with the same type the fixture already carries,
  // so it would pass even if the form ignored `defaultValues.type` and
  // hardcoded the radio. Rendering with the other value is what actually
  // proves the radio is wired to `defaultValues.type` rather than fixed.
  it("checks whichever type is actually passed in, not just Expense", () => {
    render({ defaultValues: { ...values, type: "INCOME" } });

    expect(screen.getByRole("radio", { name: "Income" })).toBeChecked();
  });

  // The invariant from the schema, made visible: income has no card.
  it("hides the card field when Income is chosen", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));

    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
  });

  it("clears a chosen card when switching to Income, so the payload stays valid", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));
    await submit(user);

    expect(vi.mocked(createTransaction).mock.calls[0][0].cardId).toBeNull();
  });

  it("shows the schema's message for an invalid amount without calling the action", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Amount/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Amount/ }), "0");
    await submit(user);

    expect(await screen.findByText("Amount must be greater than zero.")).toBeInTheDocument();
    expect(createTransaction).not.toHaveBeenCalled();
  });

  // Money stays a string end to end; a float here is what a Decimal column exists to avoid.
  it("submits the amount as a string, never a number", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(vi.mocked(createTransaction).mock.calls[0][0].amount).toBe("120.50");
  });

  it("passes the active locale, which the action cannot resolve itself", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(vi.mocked(createTransaction).mock.calls[0][1]).toBe("en-US");
  });

  it("calls updateTransaction with the id in edit mode", async () => {
    const user = userEvent.setup();
    render({ mode: "edit", transactionId: "tx-1" });

    await submit(user, "Save changes");

    expect(vi.mocked(updateTransaction).mock.calls[0][0]).toBe("tx-1");
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it("replaces rather than pushes on success, so Back does not return to the form", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(replace).toHaveBeenCalledWith("/transactions");
  });

  it("renders the action's error rather than navigating", async () => {
    vi.mocked(createTransaction).mockResolvedValue({ success: false, error: "Nope." });
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  // The edit page's first-paint concern: the label is on screen before any
  // request resolves.
  it("shows a preselected category without fetching", () => {
    render();

    expect(screen.getByLabelText(/Category/)).toHaveValue("Food");
  });
});
