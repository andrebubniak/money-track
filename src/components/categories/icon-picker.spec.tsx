import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";
import { CATEGORY_ICONS } from "@/lib/category-icons";
import { IconPicker } from "@/components/categories/icon-picker";

// The trigger's accessible name and the dialog's title are both
// "Choose an icon" by design (see icon-picker.tsx), but they render under
// different roles ("button" vs "heading"), so there is no ambiguity here.
function trigger() {
  return screen.getByRole("button", { name: "Choose an icon" });
}

describe("IconPicker", () => {
  it("shows every icon in the allow-list", async () => {
    const user = userEvent.setup();
    renderWithIntl(<IconPicker value="house" onChange={vi.fn()} />);

    await user.click(trigger());
    const dialog = await screen.findByRole("dialog");

    for (const key of Object.keys(CATEGORY_ICONS)) {
      expect(within(dialog).getByRole("button", { name: key })).toBeInTheDocument();
    }
  });

  it("selects an icon: calls onChange with its key and closes the dialog", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<IconPicker value="house" onChange={onChange} />);

    await user.click(trigger());
    const dialog = await screen.findByRole("dialog");

    await user.click(within(dialog).getByRole("button", { name: "pizza" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("pizza");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("marks the currently selected icon as pressed", async () => {
    const user = userEvent.setup();
    renderWithIntl(<IconPicker value="pizza" onChange={vi.fn()} />);

    await user.click(trigger());
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByRole("button", { name: "pizza" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(dialog).getByRole("button", { name: "house" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
