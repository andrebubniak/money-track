import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { signInSocial } = vi.hoisted(() => ({ signInSocial: vi.fn() }));

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { social: signInSocial } },
}));

import { GoogleButton } from "@/components/auth/google-button";

describe("GoogleButton", () => {
  beforeEach(() => {
    signInSocial.mockReset();
    signInSocial.mockResolvedValue({ error: null });
  });

  it("renders the idle label", () => {
    render(<GoogleButton />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("starts the Google flow with the dashboard callback", async () => {
    const user = userEvent.setup();
    render(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/dashboard",
    });
  });

  it("shows a pending label and disables itself while redirecting", async () => {
    const user = userEvent.setup();
    // Never resolves — the redirect would normally navigate away.
    signInSocial.mockImplementation(() => new Promise(() => {}));
    render(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    const button = screen.getByRole("button", { name: /redirecting to google/i });
    expect(button).toBeDisabled();
  });

  it("recovers to the idle label when the call fails", async () => {
    const user = userEvent.setup();
    signInSocial.mockResolvedValue({ error: { code: "SOMETHING_BROKE" } });
    render(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    const button = await screen.findByRole("button", { name: /continue with google/i });
    expect(button).toBeEnabled();
  });
});
