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
import type { CategoryValues } from "@/lib/validations/category";

/**
 * Echoes the key back, with any interpolated values appended, so a test can
 * assert which message key fired (and what was substituted into it) without
 * depending on a word of real catalog copy. Same pattern as the schema specs.
 */
const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;

const SESSION = { user: { id: "user-1" }, session: {} };

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

    const result = await createCategory(validValues);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.count).not.toHaveBeenCalled();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("returns a generic invalid-input error and makes no writes for an out-of-bounds payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await createCategory({ ...validValues, name: "A" });

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.category.count).not.toHaveBeenCalled();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("returns the same generic invalid-input error, not zod's raw English text, for a wrong-shaped payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    // Bypasses the client entirely — the form's own TypeScript types would
    // never let `name` be a number, but a forged POST body can.
    const forged = { ...validValues, name: 123 } as unknown as CategoryValues;
    const result = await createCategory(forged);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect((result as { error: string }).error).not.toMatch(/invalid input|expected string/i);
    expect(prisma.category.count).not.toHaveBeenCalled();
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it("refuses when the user already has 50 active categories", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.count).mockResolvedValue(50);

    const result = await createCategory(validValues);

    expect(result).toEqual({ success: false, error: "limitReached" });
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

    const result = await createCategory(validValues);

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

    await createCategory(validValues);

    expect(prisma.category.count).toHaveBeenCalledWith({
      where: { userId: "user-1", deactivatedAt: null },
    });
  });
});

describe("updateCategory", () => {
  it("returns a generic error and makes no writes when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const result = await updateCategory("cat-1", validValues);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("returns a generic invalid-input error and makes no writes for an out-of-bounds payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await updateCategory("cat-1", { ...validValues, name: "A" });

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("returns the same generic invalid-input error, not zod's raw English text, for a wrong-shaped payload", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const forged = { ...validValues, name: 123 } as unknown as CategoryValues;
    const result = await updateCategory("cat-1", forged);

    expect(result).toEqual({ success: false, error: "invalidInput" });
    expect((result as { error: string }).error).not.toMatch(/invalid input|expected string/i);
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an empty id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await updateCategory("", validValues);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an oversized id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    // A cuid is 25 characters; nothing legitimate is anywhere near this long.
    const result = await updateCategory("c".repeat(500), validValues);

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("no-ops with a not-found-shaped error for another user's category id", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
    vi.mocked(prisma.category.findFirst).mockResolvedValue(null as never);

    const result = await updateCategory("cat-owned-by-someone-else", validValues);

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

    const result = await updateCategory("does-not-exist", validValues);

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
    const result = await updateCategory("cat-1", validValues);

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

    const result = await updateCategory("cat-1", validValues);

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

    await updateCategory("cat-1", { ...validValues, description: "" });

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

    const result = await deleteCategory("cat-1");

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an empty id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await deleteCategory("");

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).not.toHaveBeenCalled();
    expect(prisma.category.update).not.toHaveBeenCalled();
  });

  it("rejects an oversized id before ever querying, with the same not-found-shaped error", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);

    const result = await deleteCategory("c".repeat(500));

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

    const result = await deleteCategory("cat-1");

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

    const result = await deleteCategory("cat-owned-by-someone-else");

    expect(result).toEqual({ success: false, error: "notFound" });
    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: { id: "cat-owned-by-someone-else", userId: "user-1" },
    });
    expect(prisma.category.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
