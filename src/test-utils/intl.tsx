import type { ReactElement, ReactNode } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import type { routing } from "@/i18n/routing";
import { QueryTestProvider } from "@/test-utils/query";
import deDE from "../../messages/de-DE.json";
import enUS from "../../messages/en-US.json";
import ptBR from "../../messages/pt-BR.json";

type Locale = (typeof routing.locales)[number];

const catalogs: Record<Locale, typeof enUS> = {
  "en-US": enUS,
  "pt-BR": ptBR,
  "de-DE": deDE,
};

/**
 * Renders with a real catalog, so component specs keep asserting actual
 * user-facing copy rather than message keys. That is deliberate: the schema
 * and error specs assert keys, and this is the layer where the strings
 * themselves stay under test.
 *
 * Defaults to English so no existing call site changes. Pass `locale` when
 * the behavior under test is locale-sensitive — e.g. a hand-built path that
 * must vary with the active locale (see google-button.spec.tsx) — so the
 * assertion can actually fail if that variation breaks.
 *
 * A `QueryClientProvider` comes along for the same reason the real app has
 * one in its root layout: anything reaching for `useQuery` — every
 * `AsyncCombobox`, and so every transaction form — throws without it.
 */
export function renderWithIntl(ui: ReactElement, locale: Locale = "en-US") {
  return render(withProviders(ui, locale));
}

/**
 * The same wrapper `renderWithIntl` applies, exposed on its own for
 * `rerender`: `rerender` replaces the entire previously-rendered tree, so
 * handing it a bare component swaps the providers out from under it and
 * remounts everything below — losing exactly the local state those tests are
 * checking survives.
 */
export function withProviders(ui: ReactNode, locale: Locale = "en-US") {
  return (
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      <QueryTestProvider>{ui}</QueryTestProvider>
    </NextIntlClientProvider>
  );
}
