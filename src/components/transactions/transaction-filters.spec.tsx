import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("@/i18n/navigation", async () => {
  const actual = await vi.importActual<typeof import("@/i18n/navigation")>("@/i18n/navigation");
  return { ...actual, useRouter: () => ({ push, replace: push, refresh: vi.fn() }) };
});

import { renderWithIntl } from "@/test-utils/intl";
import { TransactionFiltersPanel } from "@/components/transactions/transaction-filters";
import { parseTransactionFilters } from "@/lib/validations/transaction-filters";

const TODAY = new Date("2026-08-16T00:00:00.000Z");

const render = (params: Record<string, string> = {}) =>
  renderWithIntl(
    <TransactionFiltersPanel
      filters={parseTransactionFilters(params, TODAY)}
      today="2026-08-16"
      dateFormat="MDY"
      selectedCategory={null}
      selectedCard={null}
    />,
  );

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
    await user.selectOptions(screen.getByLabelText("Show"), "single");

    expect(push).not.toHaveBeenCalled();
  });

  it("navigates on Apply, and resets to page 1", async () => {
    const user = userEvent.setup();
    render({ page: "5" });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.selectOptions(screen.getByLabelText("Show"), "recurring");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(push).toHaveBeenCalledWith("/transactions?show=recurring");
  });

  it("clears to the bare path", async () => {
    const user = userEvent.setup();
    render({ type: "INCOME", show: "single", page: "3" });

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(screen.getByRole("button", { name: "Clear" }));

    expect(push).toHaveBeenCalledWith("/transactions");
  });
});
