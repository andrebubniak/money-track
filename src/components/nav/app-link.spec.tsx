import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useLinkStatus } = vi.hoisted(() => ({ useLinkStatus: vi.fn() }));

vi.mock("next/link", () => ({ useLinkStatus }));

// Stubbed to a plain anchor: the real next-intl Link needs a router context
// this test has no reason to stand up, and every assertion here is about the
// pending overlay, not about href resolution.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a {...props}>{children}</a>
  ),
}));

import { AppLink } from "@/components/nav/app-link";
import { renderWithIntl } from "@/test-utils/intl";

describe("AppLink", () => {
  beforeEach(() => {
    useLinkStatus.mockReset();
    useLinkStatus.mockReturnValue({ pending: false });
  });

  it("renders its children as a link", () => {
    renderWithIntl(<AppLink href="/register">Sign up</AppLink>);
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
  });

  it("shows no loader while idle", () => {
    renderWithIntl(<AppLink href="/register">Sign up</AppLink>);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the loader while the navigation is pending", () => {
    useLinkStatus.mockReturnValue({ pending: true });
    renderWithIntl(<AppLink href="/register">Sign up</AppLink>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("portals the loader out of the link", () => {
    // Regression guard. Rendered in place, the overlay <div> lands inside the
    // <p> that wraps these links — invalid HTML, and React 19 raises a
    // hydration error for it.
    useLinkStatus.mockReturnValue({ pending: true });
    renderWithIntl(
      <p>
        Don&apos;t have an account? <AppLink href="/register">Sign up</AppLink>
      </p>,
    );

    const overlay = screen.getByRole("status");
    expect(overlay.closest("a")).toBeNull();
    expect(overlay.closest("p")).toBeNull();
    expect(overlay.parentElement).toBe(document.body);
  });

  it("does not leave the loader behind once pending clears", () => {
    useLinkStatus.mockReturnValue({ pending: true });
    const { rerender } = renderWithIntl(<AppLink href="/register">Sign up</AppLink>);
    expect(screen.getByRole("status")).toBeInTheDocument();

    useLinkStatus.mockReturnValue({ pending: false });
    rerender(<AppLink href="/register">Sign up</AppLink>);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
