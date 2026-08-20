import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
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

import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import type { TransactionValues } from "@/lib/validations/transaction";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };
const LOCALE = "en-US";

const validValues: TransactionValues = {
  type: "EXPENSE",
  amount: "120.50",
  categoryId: "cat-1",
  cardId: "card-1",
  description: "Groceries",
  date: "2026-08-14",
  paymentDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranslations).mockResolvedValue(t as never);
  vi.mocked(headers).mockResolvedValue(new Headers());
  vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
  vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: "cat-1" } as never);
  vi.mocked(prisma.card.findFirst).mockResolvedValue({ id: "card-1" } as never);
});

describe("createTransaction", () => {
  it("refuses and writes nothing without a session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    expect(await createTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("returns the generic error, never zod's text, for a bad payload", async () => {
    const result = await createTransaction({ ...validValues, amount: "-3" }, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("stores the amount as the string it validated, never a float", async () => {
    await createTransaction({ ...validValues, amount: "0.10" }, LOCALE);

    expect(vi.mocked(prisma.transaction.create).mock.calls[0][0].data.amount).toBe("0.10");
  });

  it("normalizes the date to UTC midnight", async () => {
    await createTransaction(validValues, LOCALE);

    expect(
      (vi.mocked(prisma.transaction.create).mock.calls[0][0].data.date as Date).toISOString(),
    ).toBe("2026-08-14T00:00:00.000Z");
  });

  it("never sets recurringTransactionId — this action makes one-offs only", async () => {
    await createTransaction(validValues, LOCALE);

    expect(
      "recurringTransactionId" in vi.mocked(prisma.transaction.create).mock.calls[0][0].data,
    ).toBe(false);
  });

  // The client sends these ids; the server decides whether they are the
  // caller's to use.
  it("refuses a category belonging to someone else", async () => {
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    expect(await createTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "invalidInput",
    });
    expect(prisma.transaction.create).not.toHaveBeenCalled();
  });

  it("refuses a card belonging to someone else", async () => {
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null as never);

    expect(await createTransaction(validValues, LOCALE)).toEqual({
      success: false,
      error: "invalidInput",
    });
  });

  it("looks up references scoped to the user and to active rows", async () => {
    await createTransaction(validValues, LOCALE);

    expect(prisma.category.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "cat-1", userId: "user-1", deactivatedAt: null },
      }),
    );
  });

  it("does not look up a card when there is none", async () => {
    await createTransaction({ ...validValues, type: "INCOME", cardId: null }, LOCALE);

    expect(prisma.card.findFirst).not.toHaveBeenCalled();
  });

  it("revalidates the list", async () => {
    await createTransaction(validValues, LOCALE);

    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/transactions", "page");
  });

  it("forwards the locale to the translator", async () => {
    await createTransaction({ ...validValues, amount: "x" }, "pt-BR");

    expect(getTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "pt-BR" }),
    );
  });

  it("falls back to the default locale for an unsupported one", async () => {
    await createTransaction({ ...validValues, amount: "x" }, "fr-CA");

    expect(getTranslations).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en-US" }),
    );
  });
});

describe("updateTransaction", () => {
  beforeEach(() => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({ id: "tx-1" } as never);
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null as never);

    expect(await updateTransaction("tx-1", validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });

  it("scopes the ownership lookup to the session user and to active rows", async () => {
    await updateTransaction("tx-1", validValues, LOCALE);

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: "tx-1", userId: "user-1", deactivatedAt: null },
    });
  });

  it("refuses an over-long id before touching the database", async () => {
    expect(await updateTransaction("t".repeat(31), validValues, LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.transaction.findFirst).not.toHaveBeenCalled();
  });

  // The installment occurrences table edits a generated row through this
  // action; it must not refuse one for having a parent.
  it("updates a row generated by a recurrence", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
      id: "tx-1",
      recurringTransactionId: "rec-1",
    } as never);

    expect(await updateTransaction("tx-1", validValues, LOCALE)).toEqual({ success: true });
    expect(prisma.transaction.update).toHaveBeenCalled();
  });

  // The date ceiling is chosen from the *row*, not from the payload: a one-off
  // may never be future-dated, but an installment plan's generated occurrences
  // legitimately are, so `recurringTransactionId` widens the ceiling back to
  // `MAX_TRANSACTION_DATE`. These two pin the direction of that ternary —
  // same payload, same future date, opposite outcomes — so swapping the
  // branches fails here rather than silently shipping.
  describe("the date ceiling is chosen from the row", () => {
    // Comfortably past `TODAY` below and still inside `MAX_TRANSACTION_DATE`,
    // so the only rule that can reject it is the "not in the future" one.
    const FUTURE_DATE = "2027-03-01";

    beforeEach(() => {
      // The action reads "today" from the real clock, so it has to be pinned
      // or these tests would start passing/failing with the calendar.
      // `toFake: ["Date"]` only: `setTimeout` and friends stay real, so the
      // action's own awaits still resolve normally.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-08-19T12:00:00.000Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("refuses a future date on a one-off", async () => {
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
        id: "tx-1",
        recurringTransactionId: null,
      } as never);

      expect(
        await updateTransaction("tx-1", { ...validValues, date: FUTURE_DATE }, LOCALE),
      ).toEqual({ success: false, error: "invalidInput" });
      expect(prisma.transaction.update).not.toHaveBeenCalled();
    });

    it("accepts the same future date on a row generated by a recurrence", async () => {
      vi.mocked(prisma.transaction.findFirst).mockResolvedValue({
        id: "tx-1",
        recurringTransactionId: "rec-1",
      } as never);

      expect(
        await updateTransaction("tx-1", { ...validValues, date: FUTURE_DATE }, LOCALE),
      ).toEqual({ success: true });
      expect(prisma.transaction.update).toHaveBeenCalled();
    });
  });
});

describe("deleteTransaction", () => {
  beforeEach(() => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue({ id: "tx-1" } as never);
  });

  it("soft-deletes rather than removing the row", async () => {
    expect(await deleteTransaction("tx-1", LOCALE)).toEqual({ success: true });

    const call = vi.mocked(prisma.transaction.update).mock.calls[0][0];
    expect(call.where).toEqual({ id: "tx-1" });
    expect(call.data.deactivatedAt).toBeInstanceOf(Date);
    expect(prisma.transaction).not.toHaveProperty("delete");
  });

  // `deactivatedAt: null` excludes an already-deleted row, so re-deleting it
  // can't overwrite its original `deactivatedAt` with a fresh timestamp.
  it("scopes the ownership lookup to the session user and to active rows", async () => {
    await deleteTransaction("tx-1", LOCALE);

    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({
      where: { id: "tx-1", userId: "user-1", deactivatedAt: null },
    });
  });

  it("refuses an id that is not the caller's", async () => {
    vi.mocked(prisma.transaction.findFirst).mockResolvedValue(null as never);

    expect(await deleteTransaction("tx-1", LOCALE)).toEqual({
      success: false,
      error: "notFound",
    });
    expect(prisma.transaction.update).not.toHaveBeenCalled();
  });
});
