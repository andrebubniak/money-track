import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithIntl } from "@/test-utils/intl";
import { DatePicker } from "@/components/ui/date-picker";

const render = (props: Partial<Parameters<typeof DatePicker>[0]> = {}) =>
  renderWithIntl(
    <DatePicker value="2026-08-14" onValueChange={() => {}} dateFormat="MDY" {...props} />,
  );

describe("DatePicker", () => {
  it("labels the trigger with the user's date format, not the browser's", () => {
    render({ dateFormat: "DMY" });

    expect(screen.getByRole("button")).toHaveTextContent("14/08/2026");
  });

  it("shows a placeholder when nothing is selected", () => {
    render({ value: "" });

    expect(screen.getByRole("button")).toHaveTextContent("Pick a date");
  });

  it("reports the chosen day as a YYYY-MM-DD string", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ onValueChange });

    await user.click(screen.getByRole("button"));
    // react-day-picker's default day-button accessible name is the full
    // formatted date ("Thursday, August 20th, 2026"), not the bare day
    // number — matching only the bare number would also require discarding
    // the "today"/"selected" context screen reader users rely on, which
    // isn't this test's business to trade away.
    await user.click(await screen.findByRole("button", { name: /August 20th, 2026/ }));

    expect(onValueChange).toHaveBeenCalledWith("2026-08-20");
  });

  // The stored value is UTC midnight; a local-time round trip would shift the
  // day for anyone west of UTC.
  it("round-trips a date without shifting the day", async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render({ value: "2026-03-01", onValueChange });

    await user.click(screen.getByRole("button"));
    await user.click(await screen.findByRole("button", { name: /March 1st, 2026/ }));

    expect(onValueChange).toHaveBeenCalledWith("2026-03-01");
  });

  it("marks itself invalid for the form to describe", () => {
    render({ invalid: true });

    expect(screen.getByRole("button")).toHaveAttribute("aria-invalid", "true");
  });

  it("disables days after maxDate", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <DatePicker
        value="2026-08-10"
        onValueChange={vi.fn()}
        dateFormat="MDY"
        maxDate="2026-08-19"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Choose a date" }));

    expect(screen.getByRole("button", { name: /August 19th, 2026/ })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /August 20th, 2026/ })).toBeDisabled();
  });

  it("does not disable any day when maxDate is omitted", async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <DatePicker value="2026-08-10" onValueChange={vi.fn()} dateFormat="MDY" />,
    );

    await user.click(screen.getByRole("button", { name: "Choose a date" }));

    expect(screen.getByRole("button", { name: /August 20th, 2026/ })).not.toBeDisabled();
  });
});
