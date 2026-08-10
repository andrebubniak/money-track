import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";

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
    renderWithIntl(<GoogleButton />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("hides the icon from assistive tech so it does not pollute the accessible name", () => {
    const { container } = renderWithIntl(<GoogleButton />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("starts the Google flow with the dashboard callback", async () => {
    const user = userEvent.setup();
    renderWithIntl(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/en-US/dashboard",
      // Keeps a refused link inside the app instead of on better-auth's
      // unstyled error page.
      errorCallbackURL: "/en-US/login",
    });
  });

  it("shows a pending label and disables itself while redirecting", async () => {
    const user = userEvent.setup();
    // Never resolves — the redirect would normally navigate away.
    signInSocial.mockImplementation(() => new Promise(() => {}));
    renderWithIntl(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    const button = screen.getByRole("button", { name: /redirecting to google/i });
    expect(button).toBeDisabled();
  });

  it("recovers to the idle label when the call fails", async () => {
    const user = userEvent.setup();
    signInSocial.mockResolvedValue({ error: { code: "SOMETHING_BROKE" } });
    renderWithIntl(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    const button = await screen.findByRole("button", { name: /continue with google/i });
    expect(button).toBeEnabled();
  });

  it("recovers when the call throws instead of returning an error", async () => {
    const user = userEvent.setup();
    signInSocial.mockRejectedValue(new Error("network down"));
    renderWithIntl(<GoogleButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    const button = await screen.findByRole("button", { name: /continue with google/i });
    expect(button).toBeEnabled();
  });
});
