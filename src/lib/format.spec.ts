import { describe, expect, it } from "vitest";

import { toUtcMidnight } from "@/lib/dates";
import { formatDate, formatMoney } from "@/lib/format";

describe("formatMoney", () => {
  // Asserted by separator, not by full string equality: the currency symbol's
  // placement and spacing come from ICU and shift between Node versions.
  // The separators are the part this function actually decides.
  it("groups with commas and points with a dot for COMMA_DOT", () => {
    expect(formatMoney("1234.56", { currency: "USD", numberFormat: "COMMA_DOT" })).toContain(
      "1,234.56",
    );
  });

  it("groups with dots and points with a comma for DOT_COMMA", () => {
    expect(formatMoney("1234.56", { currency: "BRL", numberFormat: "DOT_COMMA" })).toContain(
      "1.234,56",
    );
  });

  it("always shows two decimal places", () => {
    expect(formatMoney("40", { currency: "USD", numberFormat: "COMMA_DOT" })).toContain("40.00");
  });

  it("renders the requested currency, not a fixed one", () => {
    const euros = formatMoney("10", { currency: "EUR", numberFormat: "COMMA_DOT" });
    expect(euros).toMatch(/€|EUR/);
  });

  it("accepts the string Prisma returns for a Decimal column", () => {
    expect(formatMoney("9999999999.99", { currency: "USD", numberFormat: "COMMA_DOT" })).toContain(
      "9,999,999,999.99",
    );
  });
});

describe("formatDate", () => {
  const date = toUtcMidnight("2026-08-14");

  it("renders MDY", () => {
    expect(formatDate(date, "MDY")).toBe("08/14/2026");
  });

  it("renders DMY", () => {
    expect(formatDate(date, "DMY")).toBe("14/08/2026");
  });

  it("renders YMD", () => {
    expect(formatDate(date, "YMD")).toBe("2026-08-14");
  });

  // The stored value is UTC midnight; a local-time formatter would render
  // the previous day for anyone west of UTC.
  it("reads UTC parts, so a UTC-midnight value keeps its day", () => {
    expect(formatDate(new Date("2026-01-01T00:00:00.000Z"), "YMD")).toBe("2026-01-01");
  });
});
