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
  /**
   * The trigger's accessible name. Defaults to the generic `t("open")`
   * ("Choose a date") for the common single-picker case. Pass a
   * distinguishing name — e.g. "From"/"To" — whenever two pickers appear
   * together: the trigger's own `aria-label` always wins over an external
   * `<Label htmlFor>` in accessible-name computation, so without this a
   * screen reader announces every picker on the page identically.
   */
  triggerLabel?: string;
  /**
   * `YYYY-MM-DD`. Days after this are unselectable *and* unreachable: it
   * feeds both `disabled` and `endMonth`. `disabled` alone would leave the
   * user paging through empty future months; `endMonth` alone would not stop
   * a date already sitting in `value`.
   */
  maxDate?: string;
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
  triggerLabel,
  maxDate,
}: DatePickerProps) {
  const t = useTranslations("ui.datePicker");
  const [open, setOpen] = useState(false);

  // Read with correct UTC parts, for `formatDate`/`toIsoDate`.
  const selectedForDisplay = value ? toUtcMidnight(value) : undefined;
  // Read with correct local parts, for `Calendar`.
  const selectedForCalendar = value ? toLocalMidnight(value) : undefined;
  // Read with correct local parts, for `Calendar` — same reason as
  // `selectedForCalendar` above.
  const maxForCalendar = maxDate ? toLocalMidnight(maxDate) : undefined;

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
            aria-label={triggerLabel ?? t("open")}
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
          disabled={maxForCalendar ? { after: maxForCalendar } : undefined}
          endMonth={maxForCalendar}
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
