import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { TransactionForm } from "@/components/transactions/transaction-form";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { resolveCategoryDisplay } from "@/lib/category-display";
import { toIsoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export default async function EditTransactionPage({
  params,
}: PageProps<"/[locale]/transactions/[id]/edit">) {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  // `params` is a promise in this version of Next; it must be awaited.
  const { id } = await params;

  // Scoped to the session's userId, never to the id alone — someone else's
  // id finds nothing, which is indistinguishable from a nonexistent one.
  // `deactivatedAt: null` excludes a soft-deleted transaction, the same
  // guard `cards/[id]/edit/page.tsx` and `categories/[id]/edit/page.tsx`
  // apply — without it, a deleted row still opens from a bookmark, a stale
  // tab, or Back, and can be silently re-saved.
  const transaction = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id, deactivatedAt: null },
    include: { category: true, card: true },
  });
  if (!transaction) notFound();

  const [user, t, tPresets] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { dateFormat: true },
    }),
    getTranslations("transactions"),
    getTranslations("categories.presets"),
  ]);

  const selectedCategory = {
    id: transaction.category.id,
    name: resolveCategoryDisplay(transaction.category, tPresets).name,
  };
  const selectedCard = transaction.card ? { id: transaction.card.id, name: transaction.card.name } : null;

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
        <h1 className="text-2xl font-semibold tracking-tight">{t("single.editTitle")}</h1>
      </div>

      <div className="w-full">
        <TransactionForm
          mode="edit"
          transactionId={transaction.id}
          defaultValues={{
            type: transaction.type,
            // A `Decimal(12, 2)` column always round-trips to two places;
            // `toFixed(2)` is what keeps that guarantee on the way back out
            // of Prisma's `Decimal`, matching the schema's amount regex.
            amount: transaction.amount.toFixed(2),
            categoryId: transaction.categoryId,
            cardId: transaction.cardId,
            description: transaction.description,
            date: toIsoDate(transaction.date),
            isPaid: transaction.isPaid,
          }}
          dateFormat={user.dateFormat}
          selectedCategory={selectedCategory}
          selectedCard={selectedCard}
        />
      </div>
    </main>
  );
}
