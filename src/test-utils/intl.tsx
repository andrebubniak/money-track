import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import type { routing } from "@/i18n/routing";
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
 */
export function renderWithIntl(ui: ReactElement, locale: Locale = "en-US") {
  return render(
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      {ui}
    </NextIntlClientProvider>,
  );
}
