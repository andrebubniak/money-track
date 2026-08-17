import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import { NewTransactionMenu } from "@/components/transactions/new-transaction-menu";
import { redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";

export default async function TransactionsPage() {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  const t = await getTranslations("transactions");

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        <NewTransactionMenu />
      </div>
    </main>
  );
}
