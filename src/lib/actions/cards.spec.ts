import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { card: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { createCard, deleteCard, updateCard } from "@/lib/actions/cards";
import { MAX_ACTIVE_CARDS, type CardValues } from "@/lib/validations/card";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };
const LOCALE = "en-US";

const validValues: CardValues = { name: "Personal Visa", type: "CREDIT" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranslations).mockResolvedValue(t as never);
  vi.mocked(headers).mockResolvedValue(new Headers());
});

describe("createCard", () => {
  it("returns a generic error and makes no writes when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const result = await createCard(validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.count).not.toHaveBeenCalled();
    expect(prisma.card.create).not.toHaveBeenCalled();
  });

  it("returns a generic invalid-input error and makes no writes for an out-of-bounds payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await createCard({ ...validValues, name: "A" }, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.card.count).not.toHaveBeenCalled();
    expect(prisma.card.create).not.toHaveBeenCalled();
  });

  it("returns the same generic invalid-input error, not zod's raw English text, for a wrong-shaped payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    // Bypasses the client entirely — the form's own TypeScript types would
    // never let `name` be a number, but a forged POST body can. This is a
    // base-type violation (not a bounds violation), so it's zod's own
    // hardcoded "expected string" message that would leak if invalidInputError
    // didn't intercept it — a wrong *enum value* like `type: "PREPAID"`
    // wouldn't exercise this, since that already produces our own translated
    // `type.invalid` message.
    const forged = { ...validValues, name: 123 } as unknown as CardValues;
    const result = await createCard(forged, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect((result as { error: string }).error).not.toMatch(/invalid input|expected string/i);
    expect(prisma.card.count).not.toHaveBeenCalled();
    expect(prisma.card.create).not.toHaveBeenCalled();
  });

  it("refuses when the user already has 50 active cards", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.count).mockResolvedValue(50);

    const result = await createCard(validValues, LOCALE);

    expect(result).toEqual({
      success: false,
      error: `limitReached:${JSON.stringify({ max: MAX_ACTIVE_CARDS })}`,
    });
    expect(prisma.card.count).toHaveBeenCalledWith({ where: { userId: "user-1", deactivatedAt: null } });
    expect(prisma.card.create).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("succeeds when the user has 49 active cards, going to 50", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.count).mockResolvedValue(49);
    vi.mocked(prisma.card.create).mockResolvedValue({ id: "card-50" } as never);

    const result = await createCard(validValues, LOCALE);

    expect(result).toEqual({ success: true });
    expect(prisma.card.create).toHaveBeenCalledWith({
      data: { userId: "user-1", name: "Personal Visa", type: "CREDIT" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/dashboard/cards", "page");
  });

  it("only counts active cards against the cap — the count query excludes soft-deleted rows", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.count).mockResolvedValue(0);
    vi.mocked(prisma.card.create).mockResolvedValue({ id: "card-1" } as never);

    await createCard(validValues, LOCALE);

    expect(prisma.card.count).toHaveBeenCalledWith({ where: { userId: "user-1", deactivatedAt: null } });
  });
});

describe("updateCard", () => {
  it("returns a generic error and makes no writes when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const result = await updateCard("card-1", validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it("returns a generic invalid-input error and makes no writes for an out-of-bounds payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await updateCard("card-1", { ...validValues, name: "A" }, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it("rejects an empty id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await updateCard("", validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it("rejects an oversized id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await updateCard("c".repeat(500), validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it("no-ops with a not-found-shaped error for another user's card id", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null as never);

    const result = await updateCard("card-owned-by-someone-else", validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.findFirst).toHaveBeenCalledWith({
      where: { id: "card-owned-by-someone-else", userId: "user-1" },
    });
    expect(prisma.card.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("nonexistent id also returns the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null as never);

    const result = await updateCard("does-not-exist", validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it("updates the name and type for an owned card", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.findFirst).mockResolvedValue({ id: "card-1", userId: "user-1" } as never);
    vi.mocked(prisma.card.update).mockResolvedValue({} as never);

    const result = await updateCard("card-1", { name: "Business Card", type: "DEBIT" }, LOCALE);

    expect(result).toEqual({ success: true });
    expect(prisma.card.update).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: { name: "Business Card", type: "DEBIT" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/dashboard/cards", "page");
  });
});

describe("deleteCard", () => {
  it("returns a generic error and makes no writes when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const result = await deleteCard("card-1", LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it("rejects an empty id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await deleteCard("", LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it("rejects an oversized id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await deleteCard("c".repeat(500), LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.findFirst).not.toHaveBeenCalled();
    expect(prisma.card.update).not.toHaveBeenCalled();
  });

  it("soft-deletes by setting deactivatedAt, never hard-deleting", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.findFirst).mockResolvedValue({ id: "card-1", userId: "user-1" } as never);
    vi.mocked(prisma.card.update).mockResolvedValue({} as never);

    const result = await deleteCard("card-1", LOCALE);

    expect(result).toEqual({ success: true });
    expect(prisma.card.update).toHaveBeenCalledWith({
      where: { id: "card-1" },
      data: { deactivatedAt: expect.any(Date) },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/dashboard/cards", "page");
  });

  it("no-ops with a not-found-shaped error for a non-owned id", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null as never);

    const result = await deleteCard("card-owned-by-someone-else", LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.card.findFirst).toHaveBeenCalledWith({
      where: { id: "card-owned-by-someone-else", userId: "user-1" },
    });
    expect(prisma.card.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("locale resolution", () => {
  it("forwards the caller's locale to getTranslations", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    await deleteCard("card-1", "pt-BR");

    expect(getTranslations).toHaveBeenCalledWith({ locale: "pt-BR", namespace: "cards" });
  });

  it("forwards the caller's locale to the validation schema's translator too", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await createCard({ ...validValues, name: "A" }, "de-DE");

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(getTranslations).toHaveBeenCalledWith({ locale: "de-DE", namespace: "validation.cards" });
    expect(getTranslations).toHaveBeenCalledWith({ locale: "de-DE", namespace: "cards" });
  });

  it("forwards the caller's locale to the cap-refusal message", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.card.count).mockResolvedValue(50);

    const result = await createCard(validValues, "pt-BR");

    expect(result).toEqual({
      success: false,
      error: `limitReached:${JSON.stringify({ max: MAX_ACTIVE_CARDS })}`,
    });
    expect(getTranslations).toHaveBeenCalledWith({ locale: "pt-BR", namespace: "cards" });
  });

  it("falls back to the default locale rather than throwing on an unsupported value", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    await deleteCard("card-1", "fr-FR");

    expect(getTranslations).toHaveBeenCalledWith({ locale: "en-US", namespace: "cards" });
  });
});
