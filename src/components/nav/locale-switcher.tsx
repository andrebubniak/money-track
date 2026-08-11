"use client";

import { useLocale, useTranslations } from "next-intl";
import { Globe } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

type Locale = (typeof routing.locales)[number];

/**
 * Changes the active locale from inside the app shell.
 *
 * There is no local pending state. A locale switch is a route change, so the
 * segment's `loading.tsx` skeleton already covers it — which is what
 * `.claude/rules/navigation-loading.md` prescribes for navigation inside the
 * shell. Do not add a full-screen overlay here; it would blank the sidebar.
 */
export function LocaleSwitcher() {
  const t = useTranslations("nav.localeSwitcher");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  // Base UI types the radio group's value as `any`, so narrow it here rather
  // than trusting the callback's parameter.
  function handleChange(value: unknown) {
    const next = value as Locale;
    if (next === locale) return;

    // `pathname` from @/i18n/navigation is already locale-free, so this is
    // the same page in another language. next-intl's client router writes
    // NEXT_LOCALE itself via syncLocaleCookie — nothing here touches
    // document.cookie.
    router.replace(pathname, { locale: next });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="w-full justify-start" />}
      >
        <Globe aria-hidden="true" />
        {/* Always sr-only: it names the control for screen readers while the
            visible text carries the current value. */}
        <span className="sr-only">{t("label")}</span>
        <span className="group-data-[collapsible=icon]:sr-only">
          {t(`locales.${locale}`)}
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start">
        <DropdownMenuRadioGroup value={locale} onValueChange={handleChange}>
          {routing.locales.map((option) => (
            // closeOnClick is explicit: Base UI defaults it to false on a
            // radio item, which would leave the menu open after switching.
            <DropdownMenuRadioItem key={option} value={option} closeOnClick>
              {t(`locales.${option}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
