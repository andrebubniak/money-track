import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { category: { findMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("next-intl/server", () => ({ getTranslations: vi.fn() }));

import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { GET } from "@/app/api/categories/options/route";

const SESSION = { user: { id: "user-1" }, session: {} };

/** Preset rows hold English in `name` and are translated for display. */
const category = (id: string, name: string, systemLocaleKey: string | null = null) => ({
  id,
  name,
  description: null,
  systemLocaleKey,
});

const call = (query: string) =>
  GET(new Request(`http://localhost:3000/api/categories/options${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(((key: string) => key) as never);
  vi.mocked(prisma.category.findMany).mockResolvedValue([] as never);
});

describe("GET /api/categories/options", () => {
  it("returns 401 and no rows when there is no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null as never);

    const response = await call("");

    expect(response.status).toBe(401);
    expect(prisma.category.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to the session user's active categories", async () => {
    await call("");

    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", deactivatedAt: null },
      select: { id: true, name: true, description: true, systemLocaleKey: true },
    });
  });

  it("returns at most one page and reports that more exist", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(
      Array.from({ length: 25 }, (_unused, index) =>
        category(`c${index}`, `Category ${String(index).padStart(2, "0")}`),
      ) as never,
    );

    const body = await (await call("")).json();

    expect(body.items).toHaveLength(10);
    expect(body.hasMore).toBe(true);
  });

  it("pages through the sorted list", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue(
      Array.from({ length: 25 }, (_unused, index) =>
        category(`c${index}`, `Category ${String(index).padStart(2, "0")}`),
      ) as never,
    );

    const body = await (await call("?page=3")).json();

    expect(body.items).toHaveLength(5);
    expect(body.hasMore).toBe(false);
  });

  it("sorts by name ascending", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      category("c1", "Zebra"),
      category("c2", "Apple"),
    ] as never);

    const body = await (await call("")).json();

    expect(body.items.map((item: { name: string }) => item.name)).toEqual(["Apple", "Zebra"]);
  });

  it("filters case-insensitively on the name", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      category("c1", "Food"),
      category("c2", "Transport"),
    ] as never);

    const body = await (await call("?q=FOO")).json();

    expect(body.items).toEqual([{ id: "c1", name: "Food" }]);
  });

  // The reason this endpoint cannot search or sort in SQL: a preset row's
  // `name` column holds English text the user may never see.
  it("searches and sorts the resolved display name, not the stored column", async () => {
    vi.mocked(getTranslations).mockResolvedValue(((key: string) =>
      key === "food.name" ? "Alimentação" : key) as never);
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      category("c1", "Food", "food"),
    ] as never);

    const body = await (await call("?q=aliment&locale=pt-BR")).json();

    expect(body.items).toEqual([{ id: "c1", name: "Alimentação" }]);
  });

  it("falls back to the default locale for an unsupported one", async () => {
    await call("?locale=fr-CA");

    expect(getTranslations).toHaveBeenCalledWith({
      locale: "en-US",
      namespace: "categories.presets",
    });
  });

  it("treats a malformed page as page 1 rather than erroring", async () => {
    vi.mocked(prisma.category.findMany).mockResolvedValue([category("c1", "Food")] as never);

    const response = await call("?page=-7");

    expect(response.status).toBe(200);
    expect((await response.json()).items).toHaveLength(1);
  });
});
