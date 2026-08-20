"use client";

import type * as React from "react";

import type { NumberFormat } from "@/generated/prisma/enums";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Twelve digits total — ten before the decimal point, two after — which is
 * exactly `MAX_TRANSACTION_AMOUNT` (`"9999999999.99"`) and exactly what a
 * `Decimal(12, 2)` column holds. See the design doc: the request named a
 * fourteen-digit ceiling, and the decision was to keep the column as it is.
 */
export const MAX_MONEY_DIGITS = 12;

/**
 * The separator conventions, not locales. Formatting follows the user's
 * stored `NumberFormat`, never the UI language — switching the interface to
 * Portuguese must not restyle someone's money. `src/lib/format.ts` makes the
 * same split for the read-only case.
 */
const SEPARATORS: Record<NumberFormat, { group: string; decimal: string }> = {
  COMMA_DOT: { group: ",", decimal: "." },
  DOT_COMMA: { group: ".", decimal: "," },
};

/**
 * Drops leading zeros only while at least three digits would remain, so
 * `"005"` (five cents) survives and `"00123"` collapses to `"123"`.
 */
function trimLeadingZeros(digits: string): string {
  return digits.replace(/^0+(?=\d{3})/, "");
}

/** Canonical `"1234.56"` to `"123456"`. `""` stays `""`. */
export function toDigits(value: string): string {
  if (!value) return "";
  const [whole = "", fraction = ""] = value.split(".");
  const cents = fraction.replace(/\D/g, "").padEnd(2, "0").slice(0, 2);
  return trimLeadingZeros(`${whole.replace(/\D/g, "")}${cents}`);
}

/** `"123456"` to `"1,234.56"` or `"1.234,56"`. `""` stays `""`. */
export function formatDigits(digits: string, numberFormat: NumberFormat): string {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  const { group, decimal } = SEPARATORS[numberFormat];
  const whole = padded.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${whole}${decimal}${padded.slice(-2)}`;
}

/** `"123456"` to the canonical `"1234.56"`. `""` stays `""`. */
export function toCanonical(digits: string): string {
  if (!digits) return "";
  const padded = digits.padStart(3, "0");
  return `${padded.slice(0, -2)}.${padded.slice(-2)}`;
}

export type MoneyInputProps = {
  id?: string;
  /** Canonical `"1234.56"`, or `""` for empty. */
  value: string;
  onValueChange: (value: string) => void;
  numberFormat: NumberFormat;
  placeholder?: string;
  invalid?: boolean;
  className?: string;
  /**
   * Plain prop, not `forwardRef` — React 19 passes `ref` through like any
   * other. The installment occurrences table needs one to focus the row
   * named by `?occurrence=`.
   */
  ref?: React.Ref<HTMLInputElement>;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

/**
 * A controlled currency field. State is a digit string and the display is
 * derived from it, so there is no free-form `.` or trailing `0` for a
 * re-render to drop mid-edit — the hazard that made
 * `installment-occurrences-table.tsx` keep its amount input uncontrolled
 * does not apply here.
 *
 * `type="text"`, not `type="number"`: the latter permits `-`, `e`, and
 * arbitrary decimal places, and its spinner is meaningless for a masked
 * field. `inputMode="decimal"` still gets the numeric keypad on mobile.
 */
export function MoneyInput({
  value,
  onValueChange,
  numberFormat,
  invalid,
  className,
  ...props
}: MoneyInputProps) {
  return (
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={formatDigits(toDigits(value), numberFormat)}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(0, MAX_MONEY_DIGITS);
        onValueChange(toCanonical(trimLeadingZeros(digits)));
      }}
      aria-invalid={invalid ? true : undefined}
      className={cn("lg:h-11 lg:text-base", className)}
      {...props}
    />
  );
}
