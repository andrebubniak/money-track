import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "@/test-utils/intl";
import { NewTransactionMenu } from "@/components/transactions/new-transaction-menu";

describe("NewTransactionMenu", () => {
  it("offers the three kinds, each linking to its own page", async () => {
    const user = userEvent.setup();
    renderWithIntl(<NewTransactionMenu />);

    await user.click(screen.getByRole("button", { name: "New transaction" }));

    // `DropdownMenuLinkItem` renders a real `<a>` (Base UI's `MenuLinkItem`),
    // but its accessible role is "menuitem" per the ARIA menu pattern, not
    // "link" — the `href` assertions below are what actually prove it's a
    // real, navigable link under the hood.
    expect(await screen.findByRole("menuitem", { name: /One-off transaction/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/new",
    );
    expect(screen.getByRole("menuitem", { name: /Recurring transaction/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/recurring/new",
    );
    expect(screen.getByRole("menuitem", { name: /Installments/ })).toHaveAttribute(
      "href",
      "/en-US/transactions/installments/new",
    );
  });

  it("opens the same three choices from the link variant", async () => {
    const user = userEvent.setup();
    // Deliberately not "New transaction" — that's `t("actions.new")`, the
    // button variant's own default text, so using it here would let a
    // component that ignores `label` entirely still pass.
    renderWithIntl(<NewTransactionMenu variant="link" label="Add a transaction" />);

    const trigger = screen.getByRole("button", { name: "Add a transaction" });
    // The link variant is the only one that omits the leading `Plus` icon —
    // asserting that here pins the variant itself, not just the label.
    expect(trigger.querySelector("svg")).toBeNull();

    await user.click(trigger);

    expect(
      await screen.findByRole("menuitem", { name: /One-off transaction/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Recurring transaction/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Installments/ })).toBeInTheDocument();
  });
});
