import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { replace, searchParams } = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}));

import { AccountNotLinkedDialog } from "@/components/auth/account-not-linked-dialog";

function setError(value: string | null) {
  searchParams.delete("error");
  if (value !== null) searchParams.set("error", value);
}

describe("AccountNotLinkedDialog", () => {
  beforeEach(() => {
    replace.mockReset();
    setError(null);
  });

  it("stays closed when there is no error", () => {
    render(<AccountNotLinkedDialog />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("stays closed for an unrelated error", () => {
    // Only this one failure has an explanation worth showing.
    setError("some_other_problem");
    render(<AccountNotLinkedDialog />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("opens on account_not_linked and says what to do instead", async () => {
    setError("account_not_linked");
    render(<AccountNotLinkedDialog />);

    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    expect(
      screen.getByText(/already registered with the password method/i),
    ).toBeInTheDocument();
  });

  it("clears the query string when dismissed", async () => {
    // Otherwise a refresh, or a back-then-forward, reopens it.
    const user = userEvent.setup();
    setError("account_not_linked");
    render(<AccountNotLinkedDialog />);

    await user.click(await screen.findByRole("button", { name: /got it/i }));

    expect(replace).toHaveBeenCalledWith("/login");
  });
});
