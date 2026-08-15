"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<"label"> & {
  // Appends " *" wrapped in an unstyled, aria-hidden span — no className of
  // its own, so it inherits the label's color/font/size exactly like plain
  // text would. The wrapper exists solely for `aria-hidden`: without it, the
  // asterisk becomes part of the field's computed accessible name ("Name *"
  // instead of "Name"), which breaks exact-match label queries (Playwright's
  // `getByLabel(..., { exact: true })`) and makes screen readers announce
  // the asterisk as part of the name rather than treating it as decorative.
  // The actual required-ness is (and must still be) conveyed by the field
  // itself, e.g. `aria-required` or a validation message, not by this marker
  // alone. See `.claude/rules/ui.md`.
  required?: boolean
}) {
  return (
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-bold select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
      {required && <span aria-hidden="true"> *</span>}
    </label>
  )
}

export { Label }
