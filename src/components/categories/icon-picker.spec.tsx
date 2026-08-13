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

function searchInput() {
  return screen.getByPlaceholderText("Search icons…");
}

describe("IconPicker", () => {
  it("shows every icon when the search is empty", async () => {
    const user = userEvent.setup();
    renderWithIntl(<IconPicker value="house" onChange={vi.fn()} />);

    await user.click(trigger());
    const dialog = await screen.findByRole("dialog");

    for (const key of Object.keys(CATEGORY_ICONS)) {
      expect(within(dialog).getByRole("button", { name: key })).toBeInTheDocument();
    }
  });

  it("filters icons by a case-insensitive substring match on the key", async () => {
    const user = userEvent.setup();
    renderWithIntl(<IconPicker value="house" onChange={vi.fn()} />);

    await user.click(trigger());
    const dialog = await screen.findByRole("dialog");

    // Uppercase input exercises the case-insensitivity; the assertions below
    // are derived from the real icon list rather than a hardcoded count, so
    // this does not silently drift if CATEGORY_ICONS changes.
    await user.type(searchInput(), "CAR");

    const matching = Object.keys(CATEGORY_ICONS).filter((key) => key.includes("car"));
    const nonMatching = Object.keys(CATEGORY_ICONS).filter((key) => !key.includes("car"));

    expect(matching.length).toBeGreaterThan(0);
    for (const key of matching) {
      expect(within(dialog).getByRole("button", { name: key })).toBeInTheDocument();
    }
    for (const key of nonMatching) {
      expect(within(dialog).queryByRole("button", { name: key })).not.toBeInTheDocument();
    }
  });

  it("shows a no-results message when nothing matches", async () => {
    const user = userEvent.setup();
    renderWithIntl(<IconPicker value="house" onChange={vi.fn()} />);

    await user.click(trigger());
    await user.type(searchInput(), "zzzzzzzzzz");

    expect(await screen.findByText("No icons found.")).toBeInTheDocument();
  });

  it("selects an icon: calls onChange with its key and closes the dialog", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<IconPicker value="house" onChange={onChange} />);

    await user.click(trigger());
    const dialog = await screen.findByRole("dialog");
    await user.type(searchInput(), "pizza");

    await user.click(within(dialog).getByRole("button", { name: "pizza" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("pizza");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
