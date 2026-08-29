import { describe, expect, it } from "vitest";

import { addDaysUtc, addMonthsUtc, paymentDateCeiling, toIsoDate, toUtcMidnight } from "@/lib/dates";

describe("toUtcMidnight", () => {
  it("parses a YYYY-MM-DD string as that day at UTC midnight", () => {
    expect(toUtcMidnight("2026-08-14").toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });

  it("strips the time from a Date without shifting the calendar day", () => {
    expect(toUtcMidnight(new Date("2026-08-14T23:45:12.000Z")).toISOString()).toBe(
      "2026-08-14T00:00:00.000Z",
    );
  });
});

describe("toIsoDate", () => {
  it("renders UTC parts, zero-padded", () => {
    expect(toIsoDate(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
  });

  // A local-time implementation returns 2025-12-31 here for anyone west of
  // UTC. Reading UTC parts is what keeps a stored date on its own day.
  it("does not shift a date backwards near midnight", () => {
    expect(toIsoDate(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });
});

describe("addDaysUtc", () => {
  it("crosses a month boundary", () => {
    expect(toIsoDate(addDaysUtc(toUtcMidnight("2026-01-30"), 7))).toBe("2026-02-06");
  });
});

describe("addMonthsUtc", () => {
  it("keeps the day of month when the target month is long enough", () => {
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-01-15"), 2))).toBe("2026-03-15");
  });

  // Anchored on the start date, not on the previous result: rolling forward
  // month by month would give Feb 28 -> Mar 28 and drift the whole series.
  it("clamps to the last day of a shorter target month", () => {
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-01-31"), 2))).toBe("2026-03-31");
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-01-31"), 3))).toBe("2026-04-30");
  });

  it("clamps to February 29 in a leap year", () => {
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2028-01-31"), 1))).toBe("2028-02-29");
  });

  it("rolls the year over", () => {
    expect(toIsoDate(addMonthsUtc(toUtcMidnight("2026-11-30"), 3))).toBe("2027-02-28");
  });
});

describe("paymentDateCeiling", () => {
  // The half that matters: a plan's occurrences are generated months ahead,
  // so a ceiling of the occurrence's own date would put every unpaid row of a
  // fresh plan in the future and fail `paymentDate.notInFuture`.
  it("caps a future-dated transaction at today", () => {
    expect(paymentDateCeiling("2026-12-01", "2026-08-21")).toBe("2026-08-21");
  });

  it("caps a past-dated transaction at its own date", () => {
    expect(paymentDateCeiling("2026-01-05", "2026-08-21")).toBe("2026-01-05");
  });

  it("returns today when the two are the same day", () => {
    expect(paymentDateCeiling("2026-08-21", "2026-08-21")).toBe("2026-08-21");
  });
});
