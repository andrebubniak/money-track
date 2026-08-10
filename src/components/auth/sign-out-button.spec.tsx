import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

const { signOut, replace, refresh } = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ authClient: { signOut } }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace, refresh }) }));

import { SignOutButton } from "@/components/auth/sign-out-button";

describe("SignOutButton", () => {
  beforeEach(() => {
    signOut.mockReset();
    replace.mockReset();
    refresh.mockReset();
    signOut.mockResolvedValue({});
  });

  it("renders the idle label", () => {
    renderWithIntl(<SignOutButton />);
    expect(screen.getByRole("button", { name: /^sign out$/i })).toBeInTheDocument();
  });

  it("signs out and returns to login", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
    expect(replace).toHaveBeenCalledWith("/login");
    expect(refresh).toHaveBeenCalled();
  });

  it("does not redirect before sign-out resolves", async () => {
    const user = userEvent.setup();
    signOut.mockImplementation(() => new Promise(() => {}));
    renderWithIntl(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    expect(replace).not.toHaveBeenCalled();
  });

  it("disables itself while signing out", async () => {
    const user = userEvent.setup();
    signOut.mockImplementation(() => new Promise(() => {}));
    renderWithIntl(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    expect(await screen.findByRole("button", { name: /signing out/i })).toBeDisabled();
  });

  it("stays put and re-enables when sign-out throws", async () => {
    const user = userEvent.setup();
    signOut.mockRejectedValue(new Error("network down"));
    renderWithIntl(<SignOutButton />);

    await user.click(screen.getByRole("button", { name: /^sign out$/i }));

    // The session may still be live, so redirecting would falsely imply
    // the user is signed out.
    expect(await screen.findByRole("button", { name: /^sign out$/i })).toBeEnabled();
    expect(replace).not.toHaveBeenCalled();
  });
});
