"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { useTranslations } from "next-intl";

import type { DateFormat } from "@/generated/prisma/enums";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toIsoDate, toUtcMidnight } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DatePickerProps = {
  /** `YYYY-MM-DD`, or "" for no selection. */
  value: string;
  onValueChange: (value: string) => void;
  dateFormat: DateFormat;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
};

/**
 * `Calendar` (react-day-picker) decides which day is selected, and which
 * month to open on, by reading a `Date`'s *local* Y/M/D — not its UTC ones.
 * Feeding it `toUtcMidnight`'s UTC-midnight `Date` would show the wrong day,
 * and for anyone east of UTC the wrong month too, the same failure mode
 * `onSelect` below guards against in the other direction. This stays
 * internal to the component; the value that crosses its boundary is always
 * the `YYYY-MM-DD` string.
 */
function toLocalMidnight(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * The value in and out is always a `YYYY-MM-DD` string — the shape the
 * schemas validate and the actions store. `Date` exists only inside this
 * component, where `Calendar` requires one: a UTC-midnight one for
 * `formatDate`, which reads UTC parts, and a local-midnight one for
 * `Calendar`, which reads local parts. See `toLocalMidnight` above.
 */
export function DatePicker({
  value,
  onValueChange,
  dateFormat,
  id,
  invalid,
  disabled,
}: DatePickerProps) {
  const t = useTranslations("ui.datePicker");
  const [open, setOpen] = useState(false);

  // Read with correct UTC parts, for `formatDate`/`toIsoDate`.
  const selectedForDisplay = value ? toUtcMidnight(value) : undefined;
  // Read with correct local parts, for `Calendar`.
  const selectedForCalendar = value ? toLocalMidnight(value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid ? true : undefined}
            aria-label={t("open")}
            className={cn(
              "w-full justify-start font-normal lg:h-11 lg:text-base",
              !value && "text-muted-foreground",
            )}
          />
        }
      >
        <CalendarDays data-icon="inline-start" aria-hidden="true" />
        {selectedForDisplay ? formatDate(selectedForDisplay, dateFormat) : t("placeholder")}
      </PopoverTrigger>

      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          required
          selected={selectedForCalendar}
          defaultMonth={selectedForCalendar}
          // Outside days (the trailing/leading days of adjacent months that
          // fill out the grid) would otherwise collide, on a plain day
          // number, with a same-numbered day inside the displayed month —
          // e.g. both March 1 and the outside April 1 rendering as "1".
          showOutsideDays={false}
          labels={{
            // react-day-picker's default aria-label is a full sentence
            // ("Thursday, August 20th, 2026"); the day's own text content
            // (its number) is enough here, since the trigger and the
            // calendar's month caption already give the surrounding month
            // and year.
            labelDayButton: (date) => String(date.getDate()),
          }}
          onSelect={(next) => {
            if (!next) return;
            // `Calendar` hands back a local-midnight Date; rebuilding it from
            // its local Y/M/D is what keeps the day the user clicked.
            onValueChange(
              toIsoDate(
                new Date(Date.UTC(next.getFullYear(), next.getMonth(), next.getDate())),
              ),
            );
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
