import { createTranslator } from "next-intl";

import enUS from "../../../messages/en-US.json";
import { createSignUpPayloadSchema } from "./auth";

/**
 * The sign-up schema better-auth's `before` hook enforces.
 *
 * Deliberately English. The endpoint is `/api/auth/[...all]`, outside the
 * `[locale]` segment, so no locale is resolved there — translating here would
 * mean hand-rolling negotiation that next-intl's middleware already does. The
 * error *code* is the contract the client reads; this message is for logs and
 * for API consumers. See `.claude/rules/validation.md`.
 *
 * A separate module from `auth.ts` so the English catalog and
 * `createTranslator` never reach a client bundle.
 */
const t = createTranslator({
  locale: "en-US",
  messages: enUS,
  namespace: "validation.auth",
});

export const signUpPayloadSchema = createSignUpPayloadSchema(t);
