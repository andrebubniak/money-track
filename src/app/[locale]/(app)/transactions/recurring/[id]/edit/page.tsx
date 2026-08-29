import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { RecurringTransactionForm } from "@/components/transactions/recurring-transaction-form";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { toIsoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export default async function EditRecurringTransactionPage({
  params,
}: PageProps<"/[locale]/transactions/recurring/[id]/edit">) {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  // `params` is a promise in this version of Next; it must be awaited.
  const { id } = await params;

  // Scoped to the session's userId, never to the id alone — someone else's
  // id finds nothing, which is indistinguishable from a nonexistent one.
  // `fixedOccurrencesCount: false` excludes an installment plan: editing one
  // through this form would change the definition and silently leave its
  // generated rows behind, so a plan id 404s here rather than opening the
  // wrong editor. `deactivatedAt: null` excludes a soft-deleted recurrence,
  // the same guard `transactions/[id]/edit/page.tsx` applies — without it, a
  // deleted row still opens from a bookmark, a stale tab, or Back, and can be
  // silently re-saved.
  const recurring = await prisma.recurringTransaction.findFirst({
    where: { id, userId: session.user.id, fixedOccurrencesCount: false, deactivatedAt: null },
    include: { category: true, card: true },
  });
  if (!recurring) notFound();

  const [user, t, tPresets] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { dateFormat: true, numberFormat: true },
    }),
    getTranslations("transactions"),
    getTranslations("categories.presets"),
  ]);

  const selectedCategory = {
    id: recurring.category.id,
    name: resolveCategoryDisplay(recurring.category, tPresets).name,
  };
  const selectedCard = recurring.card ? { id: recurring.card.id, name: recurring.card.name } : null;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/transactions"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t("single.back")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("recurring.editTitle")}</h1>
      </div>

      <div className="w-full">
        <RecurringTransactionForm
          mode="edit"
          recurringTransactionId={recurring.id}
          defaultValues={{
            type: recurring.type,
            // A `Decimal(12, 2)` column always round-trips to two places;
            // `toFixed(2)` is what keeps that guarantee on the way back out
            // of Prisma's `Decimal`, matching the schema's amount regex.
            amount: recurring.amount.toFixed(2),
            categoryId: recurring.categoryId,
            cardId: recurring.cardId,
            description: recurring.description,
            startDate: toIsoDate(recurring.startDate),
            frequency: recurring.frequency,
          }}
          today={toIsoDate(new Date())}
          dateFormat={user.dateFormat}
          numberFormat={user.numberFormat}
          selectedCategory={selectedCategory}
          selectedCard={selectedCard}
        />
      </div>
    </main>
  );
}
