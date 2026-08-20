import crypto from "node:crypto";

import { Pool } from "pg";

/**
 * Raw `pg`, not the generated Prisma client. `src/generated/prisma/client.ts`
 * is ESM-only (`import.meta.url` at module scope) and fails to load through
 * Playwright's spec-file transform the same way it fails under plain Node in
 * `e2e/global-setup.ts` — see that file's long comment. A handful of
 * scenarios need to seed rows no UI flow can produce yet (a generated
 * recurrence occurrence, bulk pagination fixtures), so this talks to the same
 * test database directly instead.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });

export async function dbQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

/** Closes the pool. Call once, from an `afterAll` in the file that uses this module. */
export async function closeDb(): Promise<void> {
  await pool.end();
}

/** Short, opaque, unique — not a real cuid, but the schema never checks the shape, only the length. */
export function randomId(prefix = "e2e"): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

export async function getUserIdByEmail(email: string): Promise<string> {
  const rows = await dbQuery<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`No user found for email ${email}`);
  return id;
}

export async function getCategoryIdByName(userId: string, name: string): Promise<string> {
  const rows = await dbQuery<{ id: string }>(
    "SELECT id FROM categories WHERE user_id = $1 AND name = $2",
    [userId, name],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error(`No category "${name}" found for user ${userId}`);
  return id;
}

export async function getCardIdByName(userId: string, name: string): Promise<string> {
  const rows = await dbQuery<{ id: string }>("SELECT id FROM cards WHERE user_id = $1 AND name = $2", [
    userId,
    name,
  ]);
  const id = rows[0]?.id;
  if (!id) throw new Error(`No card "${name}" found for user ${userId}`);
  return id;
}

export type SeedTransaction = {
  id?: string;
  userId: string;
  categoryId: string;
  cardId?: string | null;
  type: "INCOME" | "EXPENSE";
  /** A `Decimal(12, 2)` string, e.g. "50.00". */
  amount: string;
  description?: string | null;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `YYYY-MM-DD` when paid, null/omitted when not. */
  paymentDate?: string | null;
  recurringTransactionId?: string | null;
};

/** Inserts one `transactions` row directly, bypassing every Server Action. */
export async function insertTransaction(input: SeedTransaction): Promise<string> {
  const id = input.id ?? randomId("txn");
  await dbQuery(
    `INSERT INTO transactions
       (id, user_id, category_id, card_id, type, amount, description, date, payment_date,
        recurring_transaction_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::"TransactionType", $6, $7, $8::timestamp, $9::timestamp, $10, now(), now())`,
    [
      id,
      input.userId,
      input.categoryId,
      input.cardId ?? null,
      input.type,
      input.amount,
      input.description ?? null,
      input.date,
      input.paymentDate ?? null,
      input.recurringTransactionId ?? null,
    ],
  );
  return id;
}

export type SeedRecurringTransaction = {
  id?: string;
  userId: string;
  categoryId: string;
  cardId?: string | null;
  type: "INCOME" | "EXPENSE";
  amount: string;
  description?: string | null;
  frequency:
    | "DAILY"
    | "WEEKLY"
    | "BIWEEKLY"
    | "MONTHLY"
    | "QUARTERLY"
    | "SEMIANNUAL"
    | "YEARLY";
  /** `YYYY-MM-DD`. */
  startDate: string;
  fixedOccurrencesCount: boolean;
  occurrencesCount: number;
  /** `YYYY-MM-DD`, or null. */
  nextRunDate?: string | null;
};

/** Inserts one `recurring_transactions` row directly, bypassing every Server Action. */
export async function insertRecurringTransaction(input: SeedRecurringTransaction): Promise<string> {
  const id = input.id ?? randomId("rec");
  await dbQuery(
    `INSERT INTO recurring_transactions
       (id, user_id, category_id, card_id, type, amount, description, frequency, start_date,
        fixed_occurrences_count, occurrences_count, next_run_date, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::"TransactionType", $6, $7, $8::"RecurringFrequency", $9::timestamp,
             $10, $11, $12::timestamp, now(), now())`,
    [
      id,
      input.userId,
      input.categoryId,
      input.cardId ?? null,
      input.type,
      input.amount,
      input.description ?? null,
      input.frequency,
      input.startDate,
      input.fixedOccurrencesCount,
      input.occurrencesCount,
      input.nextRunDate ?? null,
    ],
  );
  return id;
}
