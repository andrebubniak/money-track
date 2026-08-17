import { describe, expect, it } from "vitest";

import { toIsoDate } from "@/lib/dates";
import { MAX_INSTALLMENT_OCCURRENCES, occurrenceDates } from "@/lib/transactions/occurrences";

const iso = (start: string, frequency: Parameters<typeof occurrenceDates>[1], count: number) =>
  occurrenceDates(start, frequency, count).map(toIsoDate);

describe("occurrenceDates", () => {
  it("starts on the start date itself", () => {
    expect(iso("2026-01-05", "MONTHLY", 3)[0]).toBe("2026-01-05");
  });

  it("returns exactly `count` dates", () => {
    expect(occurrenceDates("2026-01-05", "MONTHLY", 12)).toHaveLength(12);
  });

  it("steps DAILY by one day", () => {
    expect(iso("2026-01-30", "DAILY", 3)).toEqual(["2026-01-30", "2026-01-31", "2026-02-01"]);
  });

  it("steps WEEKLY by seven days", () => {
    expect(iso("2026-01-01", "WEEKLY", 3)).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
  });

  it("steps BIWEEKLY by fourteen days", () => {
    expect(iso("2026-01-01", "BIWEEKLY", 3)).toEqual(["2026-01-01", "2026-01-15", "2026-01-29"]);
  });

  it("steps MONTHLY by one month", () => {
    expect(iso("2026-01-05", "MONTHLY", 3)).toEqual(["2026-01-05", "2026-02-05", "2026-03-05"]);
  });

  it("steps QUARTERLY by three months", () => {
    expect(iso("2026-01-05", "QUARTERLY", 3)).toEqual(["2026-01-05", "2026-04-05", "2026-07-05"]);
  });

  it("steps SEMIANNUAL by six months", () => {
    expect(iso("2026-01-05", "SEMIANNUAL", 3)).toEqual(["2026-01-05", "2026-07-05", "2027-01-05"]);
  });

  it("steps YEARLY by twelve months", () => {
    expect(iso("2026-01-05", "YEARLY", 3)).toEqual(["2026-01-05", "2027-01-05", "2028-01-05"]);
  });

  // The whole point of anchoring in addMonthsUtc: a plan started on the 31st
  // returns to the 31st whenever the month has one.
  it("clamps short months without drifting the series", () => {
    expect(iso("2026-01-31", "MONTHLY", 4)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("normalizes the start to UTC midnight", () => {
    expect(occurrenceDates(new Date("2026-01-05T18:30:00.000Z"), "MONTHLY", 1)[0].toISOString()).toBe(
      "2026-01-05T00:00:00.000Z",
    );
  });

  it("returns an empty array for a count of zero", () => {
    expect(occurrenceDates("2026-01-05", "MONTHLY", 0)).toEqual([]);
  });

  // The bound is enforced by the schema too; this is the last line of defence
  // before an unbounded number of rows is written.
  it("refuses a count above the maximum", () => {
    expect(() => occurrenceDates("2026-01-05", "MONTHLY", MAX_INSTALLMENT_OCCURRENCES + 1)).toThrow();
  });
});
