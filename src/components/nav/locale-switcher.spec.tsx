import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test-utils/intl";
import { routing } from "@/i18n/routing";

const { replace, pathname } = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname(),
}));

import { LocaleSwitcher } from "@/components/nav/locale-switcher";

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    replace.mockReset();
    pathname.mockReset();
    pathname.mockReturnValue("/dashboard");
  });

  // Queried without a name: the component renders exactly one button, and its
  // accessible name is localized ("Idioma …", "Sprache …"), so matching on
  // English text would break the two non-English cases below.
  function trigger() {
    return screen.getByRole("button");
  }

  it.each([
    ["en-US", "English"],
    ["pt-BR", "Português (Brasil)"],
    ["de-DE", "Deutsch"],
  ] as const)("shows %s on the trigger as %s", (locale, expected) => {
    renderWithIntl(<LocaleSwitcher />, locale);

    expect(trigger()).toHaveTextContent(expected);
  });

  it("offers one option per configured locale", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());

    const options = await screen.findAllByRole("menuitemradio");
    // Driven by routing.locales, so adding a locale without adding an option
    // fails here rather than shipping a menu that silently omits it.
    expect(options).toHaveLength(routing.locales.length);
  });

  it("marks the active locale as checked", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LocaleSwitcher />, "de-DE");

    await user.click(trigger());

    const checked = await screen.findByRole("menuitemradio", { checked: true });
    expect(checked).toHaveTextContent("Deutsch");
  });

  it("navigates to the current path under the chosen locale", async () => {
    const user = userEvent.setup();
    pathname.mockReturnValue("/dashboard");
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());
    await user.click(await screen.findByRole("menuitemradio", { name: "Deutsch" }));

    // Both arguments asserted: hardcoding either the path or the locale fails.
    expect(replace).toHaveBeenCalledWith("/dashboard", { locale: "de-DE" });
  });

  it("uses the real current path, not a fixed one", async () => {
    const user = userEvent.setup();
    pathname.mockReturnValue("/some/other/page");
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());
    await user.click(await screen.findByRole("menuitemradio", { name: "Deutsch" }));

    expect(replace).toHaveBeenCalledWith("/some/other/page", { locale: "de-DE" });
  });

  it("does not navigate when the active locale is chosen again", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());
    await user.click(await screen.findByRole("menuitemradio", { name: "English" }));

    expect(replace).not.toHaveBeenCalled();
  });

  it("closes the menu after a choice", async () => {
    const user = userEvent.setup();
    renderWithIntl(<LocaleSwitcher />);

    await user.click(trigger());
    await user.click(await screen.findByRole("menuitemradio", { name: "Deutsch" }));

    // Base UI defaults MenuRadioItem's closeOnClick to false, so the menu
    // would otherwise stay open over the page after switching.
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });

  it("keeps an accessible name when the sidebar rail is collapsed", () => {
    renderWithIntl(<LocaleSwitcher />);

    // The label is sr-only rather than hidden: display:none would strip it
    // from the accessibility tree and leave the trigger unnamed once the rail
    // collapses to icons.
    expect(within(trigger()).getByText("Language")).toHaveClass("sr-only");
  });
});
