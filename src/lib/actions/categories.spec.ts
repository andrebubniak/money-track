import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { category: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { createCategory, deleteCategory, updateCategory } from "@/lib/actions/categories";
import { MAX_ACTIVE_CATEGORIES, type CategoryValues } from "@/lib/validations/category";

/**
 * Echoes the key back, with any interpolated values appended, so a test can
 * assert which message key fired (and what was substituted into it) without
 * depending on a word of real catalog copy. Same pattern as the schema specs.
 */
const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };

/**
 * Every action takes the active locale as its last argument — see the
 * "locale resolution" block at the bottom of this file for why it cannot
 * find one for itself.
 */
const LOCALE = "en-US";

const validValues: CategoryValues = {
  name: "Groceries",
  icon: "shopping-basket",
  description: "Food and household items",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTranslations).mockResolvedValue(t as never);
  vi.mocked(headers).mockResolvedValue(new Headers());
});

describe("createCategory", () => {
  it("returns a generic error and makes no writes when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const result = await createCategory(validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.count).not.toHaveBeenCalled();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("returns a generic invalid-input error and makes no writes for an out-of-bounds payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await createCategory({ ...validValues, name: "A" }, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.category.count).not.toHaveBeenCalled();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("returns the same generic invalid-input error, not zod's raw English text, for a wrong-shaped payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    // Bypasses the client entirely — the form's own TypeScript types would
    // never let `name` be a number, but a forged POST body can.
    const forged = { ...validValues, name: 123 } as unknown as CategoryValues;
    const result = await createCategory(forged, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect((result as { error: string }).error).not.toMatch(/invalid input|expected string/i);
    expect(prisma.category.count).not.toHaveBeenCalled();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("refuses when the user already has 50 active categories", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.count).mockResolvedValue(50);

    const result = await createCategory(validValues, LOCALE);

    expect(result).toEqual({
      success: false,
      error: `limitReached:${JSON.stringify({ max: MAX_ACTIVE_CATEGORIES })}`,
    });
    expect(prisma.category.count).toHaveBeenCalledWith({
      where: { userId: "user-1", deactivatedAt: null },
    });
    expect(prisma.category.create).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("succeeds when the user has 49 active categories, going to 50", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.count).mockResolvedValue(49);
    vi.mocked(prisma.category.create).mockResolvedValue({ id: "cat-50" } as never);

    const result = await createCategory(validValues, LOCALE);

    expect(result).toEqual({ success: true });
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Groceries",
        icon: "shopping-basket",
        description: "Food and household items",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/dashboard/categories", "page");
  });

  it("only counts active categories against the cap — the count query excludes soft-deleted rows", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    // The mock can't distinguish soft-deleted rows itself; what we're really
    // pinning is that the query passed to Prisma asks it to. A real deployed
    // DB honouring this filter is what makes a soft-deleted row free up a slot.
    vi.mocked(prisma.category.count).mockResolvedValue(0);
    vi.mocked(prisma.category.create).mockResolvedValue({ id: "cat-1" } as never);

    await createCategory(validValues, LOCALE);

    expect(prisma.category.count).toHaveBeenCalledWith({
      where: { userId: "user-1", deactivatedAt: null },
    });
  });
});

describe("updateCategory", () => {
  it("returns a generic error and makes no writes when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const result = await updateCategory("cat-1", validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("returns a generic invalid-input error and makes no writes for an out-of-bounds payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await updateCategory("cat-1", { ...validValues, name: "A" }, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("returns the same generic invalid-input error, not zod's raw English text, for a wrong-shaped payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const forged = { ...validValues, name: 123 } as unknown as CategoryValues;
    const result = await updateCategory("cat-1", forged, LOCALE);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect((result as { error: string }).error).not.toMatch(/invalid input|expected string/i);
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an empty id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await updateCategory("", validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an oversized id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    // A cuid is 25 characters; nothing legitimate is anywhere near this long.
    const result = await updateCategory("c".repeat(500), validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("no-ops with a not-found-shaped error for another user's category id", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    const result = await updateCategory("cat-owned-by-someone-else", validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: "cat-owned-by-someone-else", userId: "user-1" },
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("nonexistent id also returns the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    const result = await updateCategory("does-not-exist", validValues, LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("always nulls systemLocaleKey when editing a still-linked preset, even if the values match the resolved display text", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: "cat-1",
      userId: "user-1",
      systemLocaleKey: "housing",
    } as never);
    vi.mocked(prisma.category.update).mockResolvedValue({} as never);

    // Submitted values happen to equal what the preset would already render.
    const result = await updateCategory("cat-1", validValues, LOCALE);

    expect(result).toEqual({ success: true });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: {
        name: "Groceries",
        icon: "shopping-basket",
        description: "Food and household items",
        systemLocaleKey: null,
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/dashboard/categories", "page");
  });

  it("leaves systemLocaleKey null and just updates the fields for an already-unlinked category", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: "cat-1",
      userId: "user-1",
      systemLocaleKey: null,
    } as never);
    vi.mocked(prisma.category.update).mockResolvedValue({} as never);

    const result = await updateCategory("cat-1", validValues, LOCALE);

    expect(result).toEqual({ success: true });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: {
        name: "Groceries",
        icon: "shopping-basket",
        description: "Food and household items",
        systemLocaleKey: null,
      },
    });
  });

  it("writes an explicit null when the description is cleared, instead of leaving the old value untouched", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: "cat-1",
      userId: "user-1",
      systemLocaleKey: null,
    } as never);
    vi.mocked(prisma.category.update).mockResolvedValue({} as never);

    await updateCategory("cat-1", { ...validValues, description: "" }, LOCALE);

    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: {
        name: "Groceries",
        icon: "shopping-basket",
        description: null,
        systemLocaleKey: null,
      },
    });
  });
});

describe("deleteCategory", () => {
  it("returns a generic error and makes no writes when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const result = await deleteCategory("cat-1", LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an empty id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await deleteCategory("", LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an oversized id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await deleteCategory("c".repeat(500), LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("soft-deletes by setting deactivatedAt, never hard-deleting", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.findFirst).mockResolvedValue({
      id: "cat-1",
      userId: "user-1",
    } as never);
    vi.mocked(prisma.category.update).mockResolvedValue({} as never);

    const result = await deleteCategory("cat-1", LOCALE);

    expect(result).toEqual({ success: true });
    expect(prisma.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: { deactivatedAt: expect.any(Date) },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/[locale]/dashboard/categories", "page");
  });

  it("no-ops with a not-found-shaped error for a non-owned id", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    const result = await deleteCategory("cat-owned-by-someone-else", LOCALE);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: "cat-owned-by-someone-else", userId: "user-1" },
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

/**
 * These actions run without a route context, so `src/i18n/request.ts`'s
 * `next/root-params` lookup throws in them — a bare `getTranslations("…")`
 * takes the whole action down. The fix is the `locale` argument every action
 * now takes, forwarded to `getTranslations`.
 *
 * Nothing else in this suite would notice a regression: `getTranslations` is
 * stubbed, so a bare `getTranslations("categories")` would still "work" here
 * while throwing for every real user. Hence one case per namespace the actions
 * can reach — `categories` *and* `validation.categories` — rather than one
 * overall.
 */
describe("locale resolution", () => {
  it("forwards the caller's locale to getTranslations", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    await deleteCategory("cat-1", "pt-BR");

    expect(getTranslations).toHaveBeenCalledWith({
      locale: "pt-BR",
      namespace: "categories",
    });
  });

  it("forwards the caller's locale to the validation schema's translator too", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    // Fails the schema, so `parseValues` runs and then `invalidInputError`
    // does — the two call sites the not-found path never reaches.
    const result = await createCategory({ ...validValues, name: "A" }, "de-DE");

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(getTranslations).toHaveBeenCalledWith({
      locale: "de-DE",
      namespace: "validation.categories",
    });
    expect(getTranslations).toHaveBeenCalledWith({
      locale: "de-DE",
      namespace: "categories",
    });
  });

  it("forwards the caller's locale to the cap-refusal message", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.count).mockResolvedValue(50);

    const result = await createCategory(validValues, "pt-BR");

    expect(result).toEqual({
      success: false,
      error: `limitReached:${JSON.stringify({ max: MAX_ACTIVE_CATEGORIES })}`,
    });
    expect(getTranslations).toHaveBeenCalledWith({
      locale: "pt-BR",
      namespace: "categories",
    });
  });

  it("falls back to the default locale rather than throwing on an unsupported value", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    // Arrives in a POST body, so it is as untrusted as `id` — a forged
    // request can put anything here.
    await deleteCategory("cat-1", "fr-FR");

    expect(getTranslations).toHaveBeenCalledWith({
      locale: "en-US",
      namespace: "categories",
    });
  });
});
