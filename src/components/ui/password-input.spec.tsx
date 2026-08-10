import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { PasswordInput } from "@/components/ui/password-input";
import { renderWithIntl } from "@/test-utils/intl";

describe("PasswordInput", () => {
  it("masks the value by default", () => {
    renderWithIntl(<PasswordInput aria-label="Password" />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("reveals the value when the toggle is pressed", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasswordInput aria-label="Password" />);

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  });

  it("masks it again on a second press", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasswordInput aria-label="Password" />);

    await user.click(screen.getByRole("button", { name: "Show password" }));
    await user.click(screen.getByRole("button", { name: "Hide password" }));

    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("exposes its state to assistive technology", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasswordInput aria-label="Password" />);

    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the typed value across a visibility toggle", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasswordInput aria-label="Password" />);

    const input = screen.getByLabelText("Password");
    await user.type(input, "Hunter2hunter2");
    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(input).toHaveValue("Hunter2hunter2");
  });

  it("does not submit the surrounding form when toggled", async () => {
    // type="button" is load-bearing: a bare <button> inside a form defaults to
    // type="submit", so toggling visibility would submit the form.
    const user = userEvent.setup();
    let submitted = false;
    renderWithIntl(
      <form onSubmit={() => { submitted = true; }}>
        <PasswordInput aria-label="Password" />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(submitted).toBe(false);
  });

  it("stays keyboard reachable", async () => {
    const user = userEvent.setup();
    renderWithIntl(<PasswordInput aria-label="Password" />);

    await user.tab();
    await user.tab();

    expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
  });
});
