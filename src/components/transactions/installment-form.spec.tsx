import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/installments", () => ({
  createInstallmentPlan: vi.fn(),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/navigation")>("@/i18n/navigation");
  return { ...actual, useRouter: () => ({ replace, refresh, push: vi.fn() }) };
});

import { createInstallmentPlan } from "@/lib/actions/installments";
import { renderWithIntl } from "@/test-utils/intl";
import { InstallmentForm } from "@/components/transactions/installment-form";
import type { InstallmentValues } from "@/lib/validations/installment";

const values: InstallmentValues = {
  type: "EXPENSE",
  amount: "89.00",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Gym",
  startDate: "2026-01-05",
  frequency: "MONTHLY",
  occurrencesCount: 12,
};

const render = (overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <InstallmentForm
      defaultValues={values}
      today="2026-08-19"
      dateFormat="MDY"
      selectedCategory={{ id: "cat-1", name: "Food" }}
      selectedCard={{ id: "card-1", name: "Personal Visa" }}
      {...overrides}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createInstallmentPlan).mockResolvedValue({ success: true });
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"items":[],"hasMore":false}'))));
});

describe("InstallmentForm", () => {
  it("previews the span the plan will cover", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Number of payments/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Number of payments/ }), "12");

    // Start date 2026-01-05, monthly: the preview is what tells the user
    // they are about to create rows into next December.
    expect(
      await screen.findByText("12 transactions, 01/05/2026 to 12/05/2026"),
    ).toBeInTheDocument();
  });

  it("re-computes the preview when the frequency changes", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Number of payments/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Number of payments/ }), "3");
    await user.click(screen.getByLabelText(/Repeats/));
    await user.click(await screen.findByRole("option", { name: "Yearly" }));

    expect(
      await screen.findByText("3 transactions, 01/05/2026 to 01/05/2028"),
    ).toBeInTheDocument();
  });

  it("shows no preview until the count is valid", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Number of payments/ }));

    expect(screen.queryByText(/transactions,/)).not.toBeInTheDocument();
  });

  it("refuses a count over the maximum with the schema's message", async () => {
    const user = userEvent.setup();
    render();

    await user.clear(screen.getByRole("spinbutton", { name: /Number of payments/ }));
    await user.type(screen.getByRole("spinbutton", { name: /Number of payments/ }), "101");
    await user.click(screen.getByRole("button", { name: "Create transaction" }));

    expect(
      await screen.findByText("You can create at most 100 payments at once."),
    ).toBeInTheDocument();
    expect(createInstallmentPlan).not.toHaveBeenCalled();
  });

  it("submits the count as a number and the amount as a string", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Create transaction" }));

    const payload = vi.mocked(createInstallmentPlan).mock.calls[0][0];
    expect(payload.occurrencesCount).toBe(12);
    expect(payload.amount).toBe("89.00");
  });

  it("hides and clears the card on Income", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));
    await user.click(screen.getByRole("button", { name: "Create transaction" }));

    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
    expect(vi.mocked(createInstallmentPlan).mock.calls[0][0].cardId).toBeNull();
  });
});
