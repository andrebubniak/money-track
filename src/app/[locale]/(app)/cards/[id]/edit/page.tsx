import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { CardForm } from "@/components/cards/card-form";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function EditCardPage({
  params,
}: PageProps<"/[locale]/cards/[id]/edit">) {
  const locale = await getLocale();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  // `params` is a promise in this version of Next; it must be awaited.
  const { id } = await params;

  // Scoped to the session's userId, never to the id alone — the same rule
  // `updateCard`/`deleteCard` follow. Someone else's id finds nothing, which
  // is indistinguishable from a nonexistent one.
  const card = await prisma.card.findFirst({
    where: { id, userId: session.user.id, deactivatedAt: null },
  });
  if (!card) notFound();

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
        <h1 className="text-2xl font-semibold tracking-tight">{t("actions.edit")}</h1>
      </div>

      <div className="w-full">
        <CardForm mode="edit" cardId={card.id} defaultValues={{ name: card.name, type: card.type }} />
      </div>
    </main>
  );
}
