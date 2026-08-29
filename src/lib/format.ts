import type { DateFormat, NumberFormat } from "@/generated/prisma/enums";

import { toIsoDate } from "@/lib/dates";

export type UserFormatPreferences = {
  currency: string;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
};

/**
 * Formatting follows the user's stored preferences, not the UI language:
 * switching the interface to Portuguese must not silently restyle someone's
 * money. These two locales are used only as carriers for their separator
 * conventions — nothing else about them reaches the output.
 */
const NUMBER_FORMAT_LOCALE: Record<NumberFormat, string> = {
  COMMA_DOT: "en-US", // 1,234.56
  DOT_COMMA: "de-DE", // 1.234,56
};

/**
 * Formats the value exactly as given. The sign is the caller's business: the
 * transactions table prefixes "+" or "−" from the row's `type`, because an
 * expense is stored as a positive amount with `type: "EXPENSE"`, not as a
 * negative number.
 */
export function formatMoney(
  amount: string | number,
  preferences: Pick<UserFormatPreferences, "currency" | "numberFormat">,
): string {
  return new Intl.NumberFormat(NUMBER_FORMAT_LOCALE[preferences.numberFormat], {
    style: "currency",
    currency: preferences.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount));
}

export function formatDate(date: Date, dateFormat: DateFormat): string {
  const iso = toIsoDate(date);
  const [year, month, day] = iso.split("-");

  switch (dateFormat) {
    case "MDY":
      return `${month}/${day}/${year}`;
    case "DMY":
      return `${day}/${month}/${year}`;
    case "YMD":
      return iso;
  }
}
