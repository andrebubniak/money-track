import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recurringTransaction: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    transaction: { createMany: vi.fn() },
    category: { findFirst: vi.fn() },
    card: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  createRecurringTransaction,
  deleteRecurringTransaction,
  updateRecurringTransaction,
} from "@/lib/actions/recurring-transactions";
import type { RecurringTransactionValues } from "@/lib/validations/recurring-transaction";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };
const LOCALE = "en-US";

const validValues: RecurringTransactionValues = {
  type: "EXPENSE",
  amount: "19.90",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Netflix",
  startDate: "2026-01-05",
  frequency: "MONTHLY",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranslations).mockResolvedValue(t as never);
  vi.mocked(headers).mockResolvedValue(new Headers());
  vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
  vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: "cat-1" } as never);
  vi.mocked(prisma.card.findFirst).mockResolvedValue({ id: "card-1" } as never);
});

describe("createRecurringTransaction", () => {
  it("refuses without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    expect(await createRecurringTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.recurringTransaction.create).not.toHaveBeenCalled();
  });

  it("refuses a category that is not the caller's", async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    expect(await createRecurringTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "invalidInput",
    });
  });

  // The three columns that make this an *ongoing* recurrence rather than a
  // plan, per the schema's own comments.
  it("marks the row ongoing: no fixed count, nothing generated, a cron cue set", async () => {
    await createRecurringTransaction(validValues, LOCALE);

    const { data } = vi.mocked(prisma.recurringTransaction.create).mock.calls[0][0];
    expect(data.fixedOccurrencesCount).toBe(false);
    expect(data.occurrencesCount).toBe(0);
    expect((data.nextRunDate as Date).toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  it("generates no transactions — that is a later feature's job", async () => {
    await createRecurringTransaction(validValues, LOCALE);

    expect(prisma.transaction.createMany).not.toHaveBeenCalled();
  });

  it("normalizes the start date to UTC midnight", async () => {
    await createRecurringTransaction(validValues, LOCALE);

    const { data } = vi.mocked(prisma.recurringTransaction.create).mock.calls[0][0];
    expect((data.startDate as Date).toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });

  it("revalidates the list", async () => {
    await createRecurringTransaction(validValues, LOCALE);

    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/transactions", "page");
  });
});

describe("updateRecurringTransaction", () => {
  beforeEach(() => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({ id: "rec-1" } as never);
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await updateRecurringTransaction("rec-1", validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.recurringTransaction.update).not.toHaveBeenCalled();
  });

  // An installment plan is edited through its own action, which also rewrites
  // its occurrences. Letting this one touch a plan would change the
  // definition and leave every generated row behind — a real, filtered query
  // excludes a plan id the same way it excludes someone else's id, so the
  // mock reproduces that by resolving `null`. The `where` assertion is what
  // actually pins the exclusion: it fails the moment the discriminator is
  // dropped from the query, which the returned-`null` shape alone would not
  // catch.
  it("refuses to edit an installment plan", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await updateRecurringTransaction("rec-1", validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.recurringTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: "rec-1", userId: "user-1", fixedOccurrencesCount: false },
    });
    expect(prisma.recurringTransaction.update).not.toHaveBeenCalled();
  });

  it("keeps the cron cue in step with a changed start date", async () => {
    await updateRecurringTransaction(
      "rec-1",
      { ...validValues, startDate: "2026-03-09" },
      LOCALE,
    );

    const { data } = vi.mocked(prisma.recurringTransaction.update).mock.calls[0][0];
    expect((data.nextRunDate as Date).toISOString()).toBe("2026-03-09T00:00:00.000Z");
  });
});

describe("deleteRecurringTransaction", () => {
  beforeEach(() => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({ id: "rec-1" } as never);
  });

  it("soft-deletes the definition", async () => {
    expect(await deleteRecurringTransaction("rec-1", LOCALE)).toEqual({ success: true });

    const call = vi.mocked(prisma.recurringTransaction.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "rec-1" });
    expect(call.data.deactivatedAt).toBeInstanceOf(Date);
  });

  // Same query-level exclusion as `updateRecurringTransaction`: an
  // installment plan id gets filtered out by `where`, landing here alongside
  // "not the caller's" and "doesn't exist" as the same generic miss. The
  // `where` assertion is what pins the discriminator in the query — it fails
  // the moment `fixedOccurrencesCount: false` is dropped from it.
  it("refuses an id that is not the caller's (or is an installment plan)", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await deleteRecurringTransaction("rec-1", LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.recurringTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: "rec-1", userId: "user-1", fixedOccurrencesCount: false },
    });
  });
});
