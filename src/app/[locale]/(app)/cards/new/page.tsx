import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { CardForm } from "@/components/cards/card-form";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";

export default async function NewCardPage() {
  const locale = await getLocale();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  const t = await getTranslations("cards");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/cards"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t("title")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("actions.new")}</h1>
      </div>

      {/* No max-width: CardForm's own grid decides how much of the row each
          field takes at each breakpoint — see `.claude/rules/ui.md`. */}
      <div className="w-full">
        <CardForm mode="create" defaultValues={{ name: "" }} />
      </div>
    </main>
  );
}
