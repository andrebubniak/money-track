import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";

import { CardRowActions } from "@/components/cards/card-row-actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, redirect } from "@/i18n/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_ACTIVE_CARDS } from "@/lib/validations/card";

export default async function CardsPage() {
  const locale = await getLocale();
  // Authoritative check. This queries Postgres; src/proxy.ts does not.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return redirect({ href: "/login", locale });

  // Unlike categories, no preset rows need translation resolution before
  // sorting — `name` is always literal here, so the database can order
  // directly. See the design spec's "No translation-resolution step" note.
  const cards = await prisma.card.findMany({
    where: { userId: session.user.id, deactivatedAt: null },
    orderBy: { name: "asc" },
  });

  const t = await getTranslations("cards");

  // Read off the rows already fetched rather than issuing a second `count()`.
  // Purely a convenience for the UI — `createCard` re-checks the cap
  // server-side on every call regardless of what this renders.
  const atLimit = cards.length >= MAX_ACTIVE_CARDS;

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>

        {atLimit ? (
          // Disabled rather than hidden: an action that vanishes without
          // explanation reads as a bug, and `limitReached` says why.
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button disabled>
              <Plus data-icon="inline-start" aria-hidden="true" />
              {t("actions.new")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("limitReached", { max: MAX_ACTIVE_CARDS })}
            </p>
          </div>
        ) : (
          // A plain `Link`, not `AppLink`: this segment's own `loading.tsx`
          // covers the transition — see `.claude/rules/navigation-loading.md`.
          <Link href="/dashboard/cards/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" aria-hidden="true" />
            {t("actions.new")}
          </Link>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.name")}</TableHead>
              <TableHead>{t("table.type")}</TableHead>
              <TableHead className="text-right">{t("table.actions")}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {cards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center whitespace-normal">
                  <span className="flex flex-col items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t("table.empty")}</span>
                    <Link
                      href="/dashboard/cards/new"
                      className="text-sm font-medium underline underline-offset-4"
                    >
                      {t("table.emptyCta")}
                    </Link>
                  </span>
                </TableCell>
              </TableRow>
            ) : (
              cards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell className="font-medium">{card.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {card.type === "DEBIT" ? t("form.typeDebit") : t("form.typeCredit")}
                  </TableCell>
                  <TableCell className="text-right">
                    <CardRowActions cardId={card.id} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </main>
  );
}
