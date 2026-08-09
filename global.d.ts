import type { routing } from "@/i18n/routing";
import type messages from "./messages/en-US.json";

/**
 * Makes every `t("…")` key compile-checked against the English catalog, and
 * types `Locale` as the union of supported tags rather than `string`.
 *
 * TypeScript checks against en-US only. A key missing from pt-BR.json or
 * de-DE.json still compiles — `src/i18n/messages.spec.ts` is what catches it.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
