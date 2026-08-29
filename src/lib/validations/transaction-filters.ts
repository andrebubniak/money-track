import { z } from "zod";

import { ISO_DATE_PATTERN, toIsoDate } from "@/lib/dates";
import {
  TRANSACTION_ID_MAX_LENGTH,
  TRANSACTION_TYPES,
  type TransactionType,
} from "@/lib/validations/transaction";

export const PAGE_SIZE = 50;

export const TRANSACTION_SHOW_VALUES = ["all", "single", "recurring", "installments"] as const;
export const TRANSACTION_SORT_VALUES = ["date", "amount", "category", "description"] as const;
export const SORT_DIRECTIONS = ["asc", "desc"] as const;

export type TransactionShow = (typeof TRANSACTION_SHOW_VALUES)[number];
export type TransactionSort = (typeof TRANSACTION_SORT_VALUES)[number];
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export type TransactionFilters = {
  /** `YYYY-MM-DD`, inclusive. */
  from: string;
  /** `YYYY-MM-DD`, inclusive. */
  to: string;
  categoryId: string | null;
  cardId: string | null;
  type: TransactionType | null;
  show: TransactionShow;
  sort: TransactionSort;
  dir: SortDirection;
  page: number;
};

const idSchema = z.string().trim().min(1).max(TRANSACTION_ID_MAX_LENGTH);

/**
 * `new Date("2026-02-31T00:00:00.000Z")` does NOT return an Invalid Date —
 * V8 silently rolls the day over to March 3rd (2026 is not a leap year, so
 * February has 28 days). (An out-of-range *month* like `2026-13-01` does
 * fail, which is what makes the trap easy to miss.) So a NaN check cannot
 * reject a nonexistent day; round-tripping through `toIsoDate` and comparing
 * to the input is what actually does.
 */
const dateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_PATTERN)
  .refine((value) => toIsoDate(new Date(`${value}T00:00:00.000Z`)) === value);

const pageSchema = z.coerce.number().int().min(1);

/** Next hands back an array when a param is repeated; the first value wins. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parses one param, substituting `fallback` for anything invalid. This is the
 * whole policy of this module: `searchParams` is attacker-controlled input,
 * but a bad value in a URL someone was handed should render page 1, never an
 * error page.
 */
function parseOr<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

export function defaultPeriod(today: Date): { from: string; to: string } {
  return {
    from: toIsoDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))),
    to: toIsoDate(today),
  };
}

export function parseTransactionFilters(
  params: Record<string, string | string[] | undefined>,
  today: Date = new Date(),
): TransactionFilters {
  const fallbackPeriod = defaultPeriod(today);

  const from = parseOr(dateSchema, first(params.from), "");
  const to = parseOr(dateSchema, first(params.to), "");
  // Both or neither: half a window the user did not ask for is more
  // confusing than the default one.
  const period = from && to && from <= to ? { from, to } : fallbackPeriod;

  return {
    ...period,
    categoryId: parseOr(idSchema.nullable(), first(params.category), null),
    cardId: parseOr(idSchema.nullable(), first(params.card), null),
    type: parseOr(z.enum(TRANSACTION_TYPES).nullable(), first(params.type), null),
    show: parseOr(z.enum(TRANSACTION_SHOW_VALUES), first(params.show), "all"),
    sort: parseOr(z.enum(TRANSACTION_SORT_VALUES), first(params.sort), "date"),
    dir: parseOr(z.enum(SORT_DIRECTIONS), first(params.dir), "desc"),
    page: parseOr(pageSchema, first(params.page), 1),
  };
}

/**
 * Defaults are omitted rather than written out, so "Clear filters" lands on a
 * bare `/transactions` instead of a URL restating every default.
 */
export function buildTransactionSearchParams(
  filters: TransactionFilters,
  today: Date = new Date(),
): URLSearchParams {
  const defaults = defaultPeriod(today);
  const params = new URLSearchParams();

  if (filters.from !== defaults.from || filters.to !== defaults.to) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.cardId) params.set("card", filters.cardId);
  if (filters.type) params.set("type", filters.type);
  if (filters.show !== "all") params.set("show", filters.show);
  if (filters.sort !== "date") params.set("sort", filters.sort);
  if (filters.dir !== "desc") params.set("dir", filters.dir);
  if (filters.page !== 1) params.set("page", String(filters.page));

  return params;
}

export function clampPage(page: number, total: number): number {
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return Math.min(Math.max(page, 1), lastPage);
}

/**
 * Powers the badge on the filter panel's trigger. Sort, direction, and page
 * are view state, not filters, and are deliberately excluded — a user who
 * sorted by amount has not filtered anything.
 */
export function countActiveFilters(
  filters: TransactionFilters,
  today: Date = new Date(),
): number {
  const defaults = defaultPeriod(today);
  const periodChanged = filters.from !== defaults.from || filters.to !== defaults.to;

  return [
    periodChanged,
    filters.categoryId !== null,
    filters.cardId !== null,
    filters.type !== null,
    filters.show !== "all",
  ].filter(Boolean).length;
}
