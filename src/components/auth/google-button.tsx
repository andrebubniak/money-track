"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function GoogleButton() {
  const locale = useLocale();
  const t = useTranslations("auth.google");
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      // On success this navigates away, so `pending` is never cleared on the
      // happy path. It is only reset if the call fails and we stay on the page.
      //
      // These two are the only places in the app where a locale is written
      // into a path by hand. They have to be: both are absolute URLs handed
      // to a third party, so `@/i18n/navigation` never sees them.
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: `/${locale}/dashboard`,
        // Keep failures inside the app. Without this, a refused link lands on
        // better-auth's unstyled /api/auth/error page with no way back.
        // AuthErrorDialog picks the reason up from ?error=.
        errorCallbackURL: `/${locale}/login`,
      });
      if (error) setPending(false);
    } catch {
      // better-fetch returns errors as values by default, so this is the
      // defensive path. A thrown rejection must not strand the button in a
      // permanently disabled state with no way to retry.
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={handleClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.5 5.5 0 0 1-2.4 3.62v3h3.87c2.26-2.09 3.56-5.17 3.56-8.86Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
        />
      </svg>
      {pending ? t("redirecting") : t("continue")}
    </Button>
  );
}
