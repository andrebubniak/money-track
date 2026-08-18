import { Prisma } from "@/generated/prisma/client";

import { addDaysUtc, toUtcMidnight } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import type { RecurringFrequency } from "@/lib/transactions/occurrences";
import type { TransactionType } from "@/lib/validations/transaction";
import {
  PAGE_SIZE,
  type TransactionFilters,
  type TransactionShow,
} from "@/lib/validations/transaction-filters";

/**
 * One row of the list, whichever table it came from. Everything is a string
 * or a plain number: `amount` is cast to text in SQL rather than arriving as
 * a `Decimal`, and dates as `YYYY-MM-DD` rather than as `Date`, so a row can
 * be handed to a Client Component untouched.
 */
export type TransactionListRow = {
  kind: "single" | "installment" | "recurring";
  id: string;
  /**
   * The parent plan's id on an installment row, null otherwise. A generated
   * occurrence has no edit page of its own — its Edit action opens its plan —
   * so the row has to carry the id that page lives at.
   */
  planId: string | null;
  /** `YYYY-MM-DD`. For an ongoing recurrence, its latest occurrence in the window. */
  effectiveDate: string;
  /** `YYYY-MM-DD`; set for recurrence and installment rows, null for one-offs. */
  startDate: string | null;
  description: string | null;
  type: TransactionType;
  amount: string;
  isPaid: boolean;
  categoryId: string;
  cardId: string | null;
  frequency: RecurringFrequency | null;
  /** 1-based position in an installment series. */
  seriesIndex: number | null;
  seriesTotal: number | null;
};

export type ListQueryArgs = {
  userId: string;
  filters: TransactionFilters;
  /** Category id → resolved display name. Only consulted for `sort=category`. */
  categorySortNames: Map<string, string>;
};

type ArmName = TransactionListRow["kind"];

function armsFor(show: TransactionShow): ArmName[] {
  switch (show) {
    case "single":
      return ["single"];
    case "installments":
      return ["installment"];
    case "recurring":
      return ["recurring"];
    case "all":
      return ["single", "installment", "recurring"];
  }
}

/**
 * The optional predicates, written against whichever table's columns the arm
 * uses. `type` is compared as text so this does not depend on the Postgres
 * enum type's name.
 */
function optionalPredicates(
  filters: TransactionFilters,
  columns: { categoryId: Prisma.Sql; cardId: Prisma.Sql; type: Prisma.Sql },
): Prisma.Sql {
  const parts: Prisma.Sql[] = [];

  if (filters.categoryId) parts.push(Prisma.sql`AND ${columns.categoryId} = ${filters.categoryId}`);
  if (filters.cardId) parts.push(Prisma.sql`AND ${columns.cardId} = ${filters.cardId}`);
  if (filters.type) parts.push(Prisma.sql`AND ${columns.type}::text = ${filters.type}`);

  return parts.length > 0 ? Prisma.join(parts, " ") : Prisma.empty;
}

function singleArm(userId: string, filters: TransactionFilters, from: Date, toExclusive: Date) {
  return Prisma.sql`
    SELECT 'single' AS "kind",
           t.id AS "id",
           NULL::text AS "planId",
           to_char(t.date, 'YYYY-MM-DD') AS "effectiveDate",
           NULL::text AS "startDate",
           t.description AS "description",
           t.type::text AS "type",
           t.amount::text AS "amount",
           t.is_paid AS "isPaid",
           t.category_id AS "categoryId",
           t.card_id AS "cardId",
           NULL::text AS "frequency",
           NULL::int AS "seriesIndex",
           NULL::int AS "seriesTotal"
      FROM transactions t
     WHERE t.user_id = ${userId}
       AND t.deactivated_at IS NULL
       AND t.recurring_transaction_id IS NULL
       AND t.date >= ${from} AND t.date < ${toExclusive}
       ${optionalPredicates(filters, {
         categoryId: Prisma.raw("t.category_id"),
         cardId: Prisma.raw("t.card_id"),
         type: Prisma.raw("t.type"),
       })}`;
}

/**
 * `withSeries` is false only for the count path (see `buildListQueries`):
 * counting doesn't read `seriesIndex`, and `JOIN series s ON s.id = t.id`
 * never filters a row (every transaction this arm's own JOIN admits already
 * has `recurring_transaction_id IS NOT NULL`, which is exactly the CTE's own
 * scope), so dropping the join for a count changes nothing but the need for
 * the `series` CTE to exist in that query at all.
 */
function installmentArm(
  userId: string,
  filters: TransactionFilters,
  from: Date,
  toExclusive: Date,
  withSeries: boolean,
) {
  return Prisma.sql`
    SELECT 'installment' AS "kind",
           t.id AS "id",
           r.id AS "planId",
           to_char(t.date, 'YYYY-MM-DD') AS "effectiveDate",
           to_char(r.start_date, 'YYYY-MM-DD') AS "startDate",
           t.description AS "description",
           t.type::text AS "type",
           t.amount::text AS "amount",
           t.is_paid AS "isPaid",
           t.category_id AS "categoryId",
           t.card_id AS "cardId",
           r.frequency::text AS "frequency",
           ${withSeries ? Prisma.sql`s.index` : Prisma.sql`NULL::int`} AS "seriesIndex",
           r.occurrences_count AS "seriesTotal"
      FROM transactions t
      JOIN recurring_transactions r ON r.id = t.recurring_transaction_id
      ${withSeries ? Prisma.sql`JOIN series s ON s.id = t.id` : Prisma.empty}
     WHERE t.user_id = ${userId}
       AND t.deactivated_at IS NULL
       AND r.fixed_occurrences_count = true
       AND r.deactivated_at IS NULL
       AND t.date >= ${from} AND t.date < ${toExclusive}
       ${optionalPredicates(filters, {
         categoryId: Prisma.raw("t.category_id"),
         cardId: Prisma.raw("t.card_id"),
         type: Prisma.raw("t.type"),
       })}`;
}

/**
 * An ongoing recurrence has no date of its own, so one is derived: the latest
 * occurrence at or before the window's end, falling back to `startDate` when
 * it has generated nothing. The LATERAL join computes it once and both the
 * projection and the period filter read it, rather than repeating the
 * subquery.
 */
function recurringArm(userId: string, filters: TransactionFilters, from: Date, toExclusive: Date) {
  return Prisma.sql`
    SELECT 'recurring' AS "kind",
           r.id AS "id",
           NULL::text AS "planId",
           to_char(effective.value, 'YYYY-MM-DD') AS "effectiveDate",
           to_char(r.start_date, 'YYYY-MM-DD') AS "startDate",
           r.description AS "description",
           r.type::text AS "type",
           r.amount::text AS "amount",
           false AS "isPaid",
           r.category_id AS "categoryId",
           r.card_id AS "cardId",
           r.frequency::text AS "frequency",
           NULL::int AS "seriesIndex",
           NULL::int AS "seriesTotal"
      FROM recurring_transactions r
      CROSS JOIN LATERAL (
        SELECT COALESCE(
                 (SELECT MAX(x.date) FROM transactions x
                   WHERE x.recurring_transaction_id = r.id
                     AND x.deactivated_at IS NULL
                     AND x.date < ${toExclusive}),
                 r.start_date
               ) AS value
      ) AS effective
     WHERE r.user_id = ${userId}
       AND r.deactivated_at IS NULL
       AND r.fixed_occurrences_count = false
       AND effective.value >= ${from} AND effective.value < ${toExclusive}
       ${optionalPredicates(filters, {
         categoryId: Prisma.raw("r.category_id"),
         cardId: Prisma.raw("r.card_id"),
         type: Prisma.raw("r.type"),
       })}`;
}

/**
 * Numbering runs over every generated row — before the period filter and
 * before the soft-delete filter — so an occurrence keeps the position it was
 * created with even after an earlier sibling is deleted or falls outside the
 * window.
 */
function seriesCte(userId: string) {
  return Prisma.sql`
    WITH series AS (
      SELECT t.id AS id,
             (ROW_NUMBER() OVER (
               PARTITION BY t.recurring_transaction_id ORDER BY t.date, t.id
             ))::int AS index
        FROM transactions t
       WHERE t.user_id = ${userId}
         AND t.recurring_transaction_id IS NOT NULL
    )`;
}

function unionOf(arms: Prisma.Sql[]) {
  return Prisma.join(arms, " UNION ALL ");
}

/**
 * Ordering always ends with the same tie-break chain. `ORDER BY date DESC`
 * alone is not a total order — transactions share dates constantly — and with
 * LIMIT/OFFSET a tied row can otherwise appear on two consecutive pages or on
 * neither.
 */
function orderByClause(filters: TransactionFilters) {
  const direction = filters.dir === "asc" ? Prisma.raw("ASC") : Prisma.raw("DESC");

  const primary =
    filters.sort === "amount"
      ? Prisma.sql`(entries."amount")::numeric ${direction}`
      : filters.sort === "description"
        ? Prisma.sql`entries."description" ${direction} NULLS LAST`
        : filters.sort === "category"
          ? Prisma.sql`cat.sort_name ${direction} NULLS LAST`
          : Prisma.sql`entries."effectiveDate" ${direction}`;

  return Prisma.sql`ORDER BY ${primary}, entries."effectiveDate" DESC, entries."kind" ASC, entries."id" ASC`;
}

/**
 * The resolved display names, joined in as a literal table so Postgres can
 * order on the text the user actually reads while pagination stays exact.
 * Affordable because categories are capped at 50 per user.
 */
function categoryJoinClause(filters: TransactionFilters, names: Map<string, string>) {
  if (filters.sort !== "category") return Prisma.empty;
  if (names.size === 0) {
    // No categories to join. A one-row table that matches nothing keeps
    // `cat.sort_name` a valid reference in ORDER BY.
    return Prisma.sql`LEFT JOIN (SELECT NULL::text AS id, NULL::text AS sort_name) AS cat ON false`;
  }

  const tuples = [...names].map(([id, name]) => Prisma.sql`(${id}::text, ${name}::text)`);

  return Prisma.sql`LEFT JOIN (VALUES ${Prisma.join(tuples, ", ")}) AS cat(id, sort_name) ON cat.id = entries."categoryId"`;
}

export function buildListQueries({ userId, filters, categorySortNames }: ListQueryArgs): {
  rows: Prisma.Sql;
  total: Prisma.Sql;
} {
  const from = toUtcMidnight(filters.from);
  // The user's end date is inclusive, so the SQL bound is the following day.
  const toExclusive = addDaysUtc(toUtcMidnight(filters.to), 1);

  const selectedArms = armsFor(filters.show);

  // The projection body needs `seriesIndex`, so it joins the `series` CTE.
  // The count body only needs to know whether a row matches, so the
  // installment arm skips that join (and the CTE it depends on) entirely —
  // see `installmentArm`'s doc comment for why that's safe.
  const armBuilders: Record<ArmName, () => Prisma.Sql> = {
    single: () => singleArm(userId, filters, from, toExclusive),
    installment: () => installmentArm(userId, filters, from, toExclusive, true),
    recurring: () => recurringArm(userId, filters, from, toExclusive),
  };
  const countArmBuilders: Record<ArmName, () => Prisma.Sql> = {
    single: () => singleArm(userId, filters, from, toExclusive),
    installment: () => installmentArm(userId, filters, from, toExclusive, false),
    recurring: () => recurringArm(userId, filters, from, toExclusive),
  };

  const arms = selectedArms.map((name) => armBuilders[name]());
  const countArms = selectedArms.map((name) => countArmBuilders[name]());
  const cte = seriesCte(userId);
  const body = unionOf(arms);
  const countBody = unionOf(countArms);
  const offset = (filters.page - 1) * PAGE_SIZE;

  return {
    rows: Prisma.sql`${cte}
      SELECT entries.* FROM (${body}) AS entries
      ${categoryJoinClause(filters, categorySortNames)}
      ${orderByClause(filters)}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
    total: Prisma.sql`SELECT COUNT(*)::int AS "total" FROM (${countBody}) AS entries`,
  };
}

/**
 * The stable `n`/`N` position of every one of a single plan's generated
 * rows — live or soft-deleted — keyed by transaction id. Reuses the exact
 * `ROW_NUMBER() OVER (ORDER BY date, id)` scheme `seriesCte` computes for the
 * list (scoped here to one `recurringTransactionId` instead of partitioned
 * across all of a user's plans), so the installment edit page's occurrence
 * table numbers rows exactly the way the list does — an occurrence keeps the
 * position it was created with even after an earlier sibling is deleted, per
 * the same rule `seriesCte`'s own comment documents.
 */
export async function fetchOccurrenceIndexes(
  userId: string,
  recurringTransactionId: string,
): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<{ id: string; index: number }[]>(Prisma.sql`
    SELECT t.id AS id,
           (ROW_NUMBER() OVER (ORDER BY t.date, t.id))::int AS index
      FROM transactions t
     WHERE t.user_id = ${userId}
       AND t.recurring_transaction_id = ${recurringTransactionId}
  `);

  return new Map(rows.map((row) => [row.id, row.index]));
}

export async function fetchTransactionList(args: ListQueryArgs): Promise<{
  rows: TransactionListRow[];
  total: number;
}> {
  const { rows, total } = buildListQueries(args);

  const [rowResults, totalResults] = await Promise.all([
    prisma.$queryRaw<TransactionListRow[]>(rows),
    prisma.$queryRaw<{ total: number }[]>(total),
  ]);

  return { rows: rowResults, total: totalResults[0]?.total ?? 0 };
}
