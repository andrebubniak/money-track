import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  recurringTransaction: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  transaction: { createMany: vi.fn(), updateMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recurringTransaction: { findFirst: vi.fn() },
    category: { findFirst: vi.fn() },
    card: { findFirst: vi.fn() },
    // Runs the callback with the same mocked delegates, so the assertions
    // below see the writes the transaction would have made.
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import {
  createInstallmentPlan,
  deleteInstallmentPlan,
  updateInstallmentSeries,
} from "@/lib/actions/installments";
import { MAX_INSTALLMENT_OCCURRENCES } from "@/lib/transactions/occurrences";
import type { InstallmentValues } from "@/lib/validations/installment";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };
const LOCALE = "en-US";

const validValues: InstallmentValues = {
  type: "EXPENSE",
  amount: "89.00",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Gym",
  startDate: "2026-01-05",
  frequency: "MONTHLY",
  occurrencesCount: 12,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranslations).mockResolvedValue(t as never);
  vi.mocked(headers).mockResolvedValue(new Headers());
  vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
  vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: "cat-1" } as never);
  vi.mocked(prisma.card.findFirst).mockResolvedValue({ id: "card-1" } as never);
  tx.recurringTransaction.create.mockResolvedValue({ id: "plan-1" });
  tx.transaction.createMany.mockResolvedValue({ count: 12 });
  tx.recurringTransaction.update.mockResolvedValue({ id: "plan-1" });
  tx.transaction.updateMany.mockResolvedValue({ count: 12 });
});

describe("createInstallmentPlan", () => {
  it("refuses without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    expect(await createInstallmentPlan(validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a count over the maximum", async () => {
    expect(
      await createInstallmentPlan(
        { ...validValues, occurrencesCount: MAX_INSTALLMENT_OCCURRENCES + 1 },
        LOCALE,
      ),
    ).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // The definition and its rows are written together or not at all.
  it("writes the plan and its rows inside one database transaction", async () => {
    await createInstallmentPlan(validValues, LOCALE);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.recurringTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.transaction.createMany).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/transactions", "page");
  });

  it("marks the definition closed: fixed count, final total, no cron cue", async () => {
    await createInstallmentPlan(validValues, LOCALE);

    const { data } = tx.recurringTransaction.create.mock.calls[0][0];
    expect(data.fixedOccurrencesCount).toBe(true);
    expect(data.occurrencesCount).toBe(12);
    expect(data.nextRunDate).toBeNull();
  });

  it("generates one row per occurrence, stepped by the frequency", async () => {
    await createInstallmentPlan(validValues, LOCALE);

    const { data } = tx.transaction.createMany.mock.calls[0][0];
    expect(data).toHaveLength(12);
    expect((data[0].date as Date).toISOString()).toBe("2026-01-05T00:00:00.000Z");
    expect((data[11].date as Date).toISOString()).toBe("2026-12-05T00:00:00.000Z");
  });

  it("points every generated row at its parent, unpaid", async () => {
    await createInstallmentPlan(validValues, LOCALE);

    const { data } = tx.transaction.createMany.mock.calls[0][0];
    expect(data.every((row: { recurringTransactionId: string }) => row.recurringTransactionId === "plan-1")).toBe(true);
    expect(data.every((row: { isPaid: boolean }) => row.isPaid === false)).toBe(true);
    expect(data.every((row: { amount: string }) => row.amount === "89.00")).toBe(true);
  });

  it("clamps month ends rather than drifting the series", async () => {
    await createInstallmentPlan(
      { ...validValues, startDate: "2026-01-31", occurrencesCount: 3 },
      LOCALE,
    );

    const { data } = tx.transaction.createMany.mock.calls[0][0];
    expect(data.map((row: { date: Date }) => row.date.toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("refuses a card that is not the caller's", async () => {
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null as never);

    expect(await createInstallmentPlan(validValues, LOCALE)).toEqual({
      success: false,
      error: "invalidInput",
    });
  });
});

describe("updateInstallmentSeries", () => {
  beforeEach(() => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
      id: "plan-1",
      fixedOccurrencesCount: true,
    } as never);
  });

  const seriesValues = { type: "EXPENSE" as const, categoryId: "cat-2", cardId: "card-2" };

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await updateInstallmentSeries("plan-1", seriesValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // Confirms the ownership lookup carries the `fixedOccurrencesCount: true`
  // discriminator: an ongoing recurrence's id must be filtered out by the
  // query itself, not by a runtime re-check of the returned row (which the
  // mock would happily let slide either way).
  it("scopes the ownership lookup to the caller's fixed-count plans", async () => {
    await updateInstallmentSeries("plan-1", seriesValues, LOCALE);

    expect(prisma.recurringTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: "plan-1", userId: "user-1", fixedOccurrencesCount: true, deactivatedAt: null },
    });
  });

  // These three fields classify the whole series; letting them drift row by
  // row would make the category column meaningless.
  it("writes the series fields to the definition and every live occurrence", async () => {
    await updateInstallmentSeries("plan-1", seriesValues, LOCALE);

    expect(tx.recurringTransaction.update).toHaveBeenCalledWith({
      where: { id: "plan-1" },
      data: { categoryId: "cat-2", cardId: "card-2", type: "EXPENSE" },
    });
    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { recurringTransactionId: "plan-1", deactivatedAt: null },
      data: { categoryId: "cat-2", cardId: "card-2", type: "EXPENSE" },
    });
  });

  it("leaves the per-occurrence fields alone", async () => {
    await updateInstallmentSeries("plan-1", seriesValues, LOCALE);

    const { data } = tx.transaction.updateMany.mock.calls[0][0];
    for (const field of ["amount", "date", "description", "isPaid"]) {
      expect(field in data).toBe(false);
    }
  });

  it("refuses an ongoing recurrence — that one has its own action", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await updateInstallmentSeries("rec-1", seriesValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
  });
});

describe("deleteInstallmentPlan", () => {
  beforeEach(() => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue({
      id: "plan-1",
      fixedOccurrencesCount: true,
    } as never);
  });

  // Same discriminator check as `updateInstallmentSeries` above: the query
  // itself must exclude ongoing recurrences, not a re-check afterward.
  it("scopes the ownership lookup to the caller's fixed-count plans", async () => {
    await deleteInstallmentPlan("plan-1", LOCALE);

    expect(prisma.recurringTransaction.findFirst).toHaveBeenCalledWith({
      where: { id: "plan-1", userId: "user-1", fixedOccurrencesCount: true, deactivatedAt: null },
    });
  });

  // The occurrences *are* the plan's representation in the list, so deleting
  // only the definition would appear to do nothing.
  it("soft-deletes the definition and every occurrence together", async () => {
    expect(await deleteInstallmentPlan("plan-1", LOCALE)).toEqual({ success: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.recurringTransaction.update.mock.calls[0][0].data.deactivatedAt).toBeInstanceOf(Date);
    expect(tx.transaction.updateMany.mock.calls[0][0].where).toEqual({
      recurringTransactionId: "plan-1",
      deactivatedAt: null,
    });
    expect(tx.transaction.updateMany.mock.calls[0][0].data.deactivatedAt).toBeInstanceOf(Date);
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.recurringTransaction.findFirst).mockResolvedValue(null as never);

    expect(await deleteInstallmentPlan("plan-1", LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
