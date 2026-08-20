import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/actions/installments", () => ({
  updateInstallmentSeries: vi.fn(),
  deleteInstallmentPlan: vi.fn(),
}));

const replace = vi.fn();
const refresh = vi.fn();
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/navigation")>("@/i18n/navigation");
  return { ...actual, useRouter: () => ({ replace, refresh, push: vi.fn() }) };
});

import { deleteInstallmentPlan, updateInstallmentSeries } from "@/lib/actions/installments";
import { renderWithIntl } from "@/test-utils/intl";
import { InstallmentSeriesForm } from "@/components/transactions/installment-series-form";
import type { InstallmentSeriesValues } from "@/lib/validations/installment";

const values: InstallmentSeriesValues = {
  type: "EXPENSE",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Gym",
};

const render = (overrides: Record<string, unknown> = {}) =>
  renderWithIntl(
    <InstallmentSeriesForm
      planId="plan-1"
      defaultValues={values}
      selectedCategory={{ id: "cat-1", name: "Food" }}
      selectedCard={{ id: "card-1", name: "Personal Visa" }}
      occurrencesCount={12}
      liveOccurrencesCount={12}
      frequency="MONTHLY"
      startDate="2026-01-05"
      dateFormat="MDY"
      {...overrides}
    />,
  );

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Save changes" }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateInstallmentSeries).mockResolvedValue({ success: true });
  vi.mocked(deleteInstallmentPlan).mockResolvedValue({ success: true });
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"items":[],"hasMore":false}'))));
});

describe("InstallmentSeriesForm", () => {
  it("has no amount, date, or paid field — those are per occurrence", () => {
    render();

    expect(screen.queryByLabelText(/Amount/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Date/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Already paid")).not.toBeInTheDocument();
  });

  // Description classifies the whole plan — every payment describes the same
  // thing — so it lives here rather than once per occurrence row.
  it("renders the plan's description, server-rendered rather than only after hydration", () => {
    render();

    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Gym");
  });

  it("submits the description as a series field", async () => {
    const user = userEvent.setup();
    render();

    const description = screen.getByRole("textbox", { name: "Description" });
    await user.clear(description);
    await user.type(description, "Gym membership");
    await submit(user);

    expect(vi.mocked(updateInstallmentSeries).mock.calls[0][1].description).toBe("Gym membership");
  });

  it("shows frequency, start date, and payment count as read-only text", () => {
    render();

    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("01/05/2026")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    // Not editable controls.
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Repeats/ })).not.toBeInTheDocument();
  });

  it("states that saving updates every payment, and that the frozen fields can't change", () => {
    render();

    expect(
      screen.getByText(
        "Changing the description, category, card, or type updates every payment below.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "How often it repeats, when it starts, and how many payments there are can't be changed. Create a new plan instead.",
      ),
    ).toBeInTheDocument();
  });

  it("hides and clears the card on Income", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("radio", { name: "Income" }));
    await submit(user);

    expect(screen.queryByLabelText("Card")).not.toBeInTheDocument();
    expect(vi.mocked(updateInstallmentSeries).mock.calls[0][1].cardId).toBeNull();
  });

  it("passes the plan id, values, and active locale to the action", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(vi.mocked(updateInstallmentSeries).mock.calls[0][0]).toBe("plan-1");
    expect(vi.mocked(updateInstallmentSeries).mock.calls[0][1]).toMatchObject({
      type: "EXPENSE",
      categoryId: "cat-1",
      cardId: "card-1",
      description: "Gym",
    });
    expect(vi.mocked(updateInstallmentSeries).mock.calls[0][2]).toBe("en-US");
  });

  it("stays on the page and shows a saved confirmation, rather than navigating away", async () => {
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalled();
  });

  it("renders the action's error rather than a saved confirmation", async () => {
    vi.mocked(updateInstallmentSeries).mockResolvedValue({ success: false, error: "Nope." });
    const user = userEvent.setup();
    render();

    await submit(user);

    expect(await screen.findByText("Nope.")).toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("opens a confirmation before deleting the plan, interpolating the occurrence count", async () => {
    const user = userEvent.setup();
    render({ liveOccurrencesCount: 7 });

    await user.click(screen.getByRole("button", { name: "Delete plan" }));

    expect(
      await screen.findByText("This will remove the plan and all 7 of its payments. This can't be undone."),
    ).toBeInTheDocument();
    expect(deleteInstallmentPlan).not.toHaveBeenCalled();
  });

  // The dialog names how many transactions actually disappear —
  // `deleteInstallmentPlan` only soft-deletes *live* rows — not the plan's
  // frozen original total, which would overstate the count once any
  // occurrence has already been deleted individually.
  it("interpolates the live occurrence count, not the frozen original total", async () => {
    const user = userEvent.setup();
    render({ occurrencesCount: 12, liveOccurrencesCount: 9 });

    await user.click(screen.getByRole("button", { name: "Delete plan" }));

    expect(
      await screen.findByText("This will remove the plan and all 9 of its payments. This can't be undone."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/all 12 of its payments/)).not.toBeInTheDocument();
  });

  it("deletes the plan and navigates back to the list on confirm", async () => {
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Delete plan" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteInstallmentPlan).toHaveBeenCalledWith("plan-1", "en-US");
    expect(replace).toHaveBeenCalledWith("/transactions");
  });

  it("shows the delete action's error and keeps the dialog open", async () => {
    vi.mocked(deleteInstallmentPlan).mockResolvedValue({ success: false, error: "Cannot delete." });
    const user = userEvent.setup();
    render();

    await user.click(screen.getByRole("button", { name: "Delete plan" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Cannot delete.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
