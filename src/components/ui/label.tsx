"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<"label"> & {
  // Appends a plain " *" to the label text — no wrapping element, so it's
  // just more text in the same `<label>` and inherits its color, font, and
  // size automatically. This is decorative — the actual required-ness is
  // (and must still be) conveyed by the field itself, e.g. `aria-required`
  // or a validation message, not by this marker alone. See
  // `.claude/rules/ui.md`.
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
      {required && " *"}
    </label>
  )
}

export { Label }
