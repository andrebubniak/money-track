import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";

import { TransactionForm } from "@/components/transactions/transaction-form";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { toIsoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export default async function NewTransactionPage() {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { dateFormat: true, numberFormat: true },
  });

  const t = await getTranslations("transactions");

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
        <h1 className="text-2xl font-semibold tracking-tight">{t("single.newTitle")}</h1>
      </div>

      {/* No max-width: TransactionForm's own grid decides how much of the
          row each field takes at each breakpoint — see `.claude/rules/ui.md`. */}
      <div className="w-full">
        <TransactionForm
          mode="create"
          defaultValues={{
            type: "EXPENSE",
            amount: "",
            categoryId: "",
            cardId: null,
            description: null,
            date: toIsoDate(new Date()),
            paymentDate: null,
          }}
          today={toIsoDate(new Date())}
          dateFormat={user.dateFormat}
          numberFormat={user.numberFormat}
          selectedCategory={null}
          selectedCard={null}
        />
      </div>
    </main>
  );
}
