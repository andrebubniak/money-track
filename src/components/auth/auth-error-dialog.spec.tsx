import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

const { replace, searchParams } = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
}));

import { AuthErrorDialog } from "@/components/auth/auth-error-dialog";

function setError(value: string | null) {
  searchParams.delete("error");
  if (value !== null) searchParams.set("error", value);
}

describe("AuthErrorDialog", () => {
  beforeEach(() => {
    replace.mockReset();
    setError(null);
  });

  it("stays closed when there is no error", () => {
    renderWithIntl(<AuthErrorDialog />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("explains a refused Google link", async () => {
    setError("account_not_linked");
    renderWithIntl(<AuthErrorDialog />);

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(/already registered with the password method/i),
    ).toBeInTheDocument();
  });

  it("explains a replayed sign-in whose state has expired", async () => {
    // What Back into a finished Google flow produces.
    setError("state_mismatch");
    renderWithIntl(<AuthErrorDialog />);

    expect(await screen.findByText(/sign-in link expired/i)).toBeInTheDocument();
  });

  it("still explains an unrecognised failure", async () => {
    // better-auth's slug list grows between releases; swallowing a failed
    // sign-in silently is worse than a generic message.
    setError("some_future_slug");
    renderWithIntl(<AuthErrorDialog />);

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/Please try again/i)).toBeInTheDocument();
  });

  it("clears the query string when dismissed", async () => {
    const user = userEvent.setup();
    setError("state_mismatch");
    renderWithIntl(<AuthErrorDialog />);

    await user.click(await screen.findByRole("button", { name: /got it/i }));

    expect(replace).toHaveBeenCalledWith("/login");
  });
});
