import { describe, expect, it } from "vitest";

import {
  buildTransactionSearchParams,
  clampPage,
  countActiveFilters,
  defaultPeriod,
  PAGE_SIZE,
  parseTransactionFilters,
} from "@/lib/validations/transaction-filters";

const TODAY = new Date("2026-08-16T12:00:00.000Z");

const parse = (params: Record<string, string | string[] | undefined>) =>
  parseTransactionFilters(params, TODAY);

describe("defaultPeriod", () => {
  it("runs from day 1 of the current month to today", () => {
    expect(defaultPeriod(TODAY)).toEqual({ from: "2026-08-01", to: "2026-08-16" });
  });
});

describe("parseTransactionFilters", () => {
  it("returns every default for an empty query string", () => {
    expect(parse({})).toEqual({
      from: "2026-08-01",
      to: "2026-08-16",
      categoryId: null,
      cardId: null,
      type: null,
      show: "all",
      sort: "date",
      dir: "desc",
      page: 1,
    });
  });

  it("reads a well-formed query string", () => {
    expect(
      parse({
        from: "2026-01-01",
        to: "2026-03-31",
        category: "clx0000000000000000000001",
        card: "clx0000000000000000000002",
        type: "INCOME",
        show: "installments",
        sort: "amount",
        dir: "asc",
        page: "3",
      }),
    ).toEqual({
      from: "2026-01-01",
      to: "2026-03-31",
      categoryId: "clx0000000000000000000001",
      cardId: "clx0000000000000000000002",
      type: "INCOME",
      show: "installments",
      sort: "amount",
      dir: "asc",
      page: 3,
    });
  });

  // A URL someone was handed must render a page, not a 500.
  describe("invalid input falls back instead of throwing", () => {
    it("ignores an unknown sort", () => {
      expect(parse({ sort: "drop table" }).sort).toBe("date");
    });

    it("ignores an unknown direction", () => {
      expect(parse({ dir: "sideways" }).dir).toBe("desc");
    });

    it("ignores an unknown show value", () => {
      expect(parse({ show: "everything" }).show).toBe("all");
    });

    it("ignores an unknown type", () => {
      expect(parse({ type: "TRANSFER" }).type).toBeNull();
    });

    it("ignores an over-long id", () => {
      expect(parse({ category: "c".repeat(31) }).categoryId).toBeNull();
    });

    it("clamps a page below 1", () => {
      expect(parse({ page: "-4" }).page).toBe(1);
      expect(parse({ page: "0" }).page).toBe(1);
    });

    it("ignores a non-numeric page", () => {
      expect(parse({ page: "two" }).page).toBe(1);
    });

    it("reverts both dates when either is malformed", () => {
      expect(parse({ from: "01/01/2026", to: "2026-03-31" })).toMatchObject({
        from: "2026-08-01",
        to: "2026-08-16",
      });
    });

    // A nonexistent day is well-shaped, so the regex passes it. `new Date`
    // does not reject it either — it rolls 2026-02-31 over to March 2nd —
    // so without the round-trip check this silently filters on a date the
    // user never asked for.
    it("reverts a well-shaped but nonexistent day", () => {
      expect(parse({ from: "2026-02-31", to: "2026-03-31" })).toMatchObject({
        from: "2026-08-01",
        to: "2026-08-16",
      });
    });

    it("reverts both dates when from is after to", () => {
      expect(parse({ from: "2026-05-01", to: "2026-04-01" })).toMatchObject({
        from: "2026-08-01",
        to: "2026-08-16",
      });
    });

    it("accepts an equal from and to", () => {
      expect(parse({ from: "2026-05-01", to: "2026-05-01" })).toMatchObject({
        from: "2026-05-01",
        to: "2026-05-01",
      });
    });

    // Next gives an array when a param is repeated.
    it("takes the first value of a repeated param", () => {
      expect(parse({ sort: ["amount", "date"] }).sort).toBe("amount");
    });
  });
});

describe("buildTransactionSearchParams", () => {
  it("omits every default, so clearing filters produces a bare path", () => {
    expect(buildTransactionSearchParams(parse({}), TODAY).toString()).toBe("");
  });

  it("writes only what differs from the defaults", () => {
    const params = buildTransactionSearchParams(parse({ show: "recurring", page: "2" }), TODAY);
    expect(params.get("show")).toBe("recurring");
    expect(params.get("page")).toBe("2");
    expect(params.get("sort")).toBeNull();
    expect(params.get("from")).toBeNull();
  });

  it("round-trips a fully specified filter set", () => {
    const filters = parse({
      from: "2026-01-01",
      to: "2026-03-31",
      category: "clx0000000000000000000001",
      card: "clx0000000000000000000002",
      type: "INCOME",
      show: "single",
      sort: "category",
      dir: "asc",
      page: "4",
    });

    expect(
      parseTransactionFilters(
        Object.fromEntries(buildTransactionSearchParams(filters, TODAY)),
        TODAY,
      ),
    ).toEqual(filters);
  });
});

describe("clampPage", () => {
  it("keeps a page inside the result set", () => {
    expect(clampPage(2, PAGE_SIZE * 3)).toBe(2);
  });

  it("clamps past the last page", () => {
    expect(clampPage(999, PAGE_SIZE + 1)).toBe(2);
  });

  it("stays on page 1 for an empty result set", () => {
    expect(clampPage(3, 0)).toBe(1);
  });
});

describe("countActiveFilters", () => {
  it("counts nothing when everything is default", () => {
    expect(countActiveFilters(parse({}), TODAY)).toBe(0);
  });

  // Sort, direction, and page are not filters — they must not inflate the
  // badge on the filter panel's trigger.
  it("ignores sort, direction, and page", () => {
    expect(countActiveFilters(parse({ sort: "amount", dir: "asc", page: "5" }), TODAY)).toBe(0);
  });

  it("counts a changed period once, not twice", () => {
    expect(countActiveFilters(parse({ from: "2026-01-01", to: "2026-03-31" }), TODAY)).toBe(1);
  });

  it("counts each non-default filter", () => {
    expect(
      countActiveFilters(
        parse({ category: "clx0000000000000000000001", type: "INCOME", show: "single" }),
        TODAY,
      ),
    ).toBe(3);
  });
});
