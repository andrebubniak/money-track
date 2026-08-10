import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en-US.json";

/**
 * Renders with the real English catalog, so component specs keep asserting
 * actual user-facing copy rather than message keys. That is deliberate: the
 * schema and error specs assert keys, and this is the layer where the English
 * strings themselves stay under test.
 */
export function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="en-US" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}
