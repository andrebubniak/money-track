# UI Guideline

Visual and interaction conventions for MoneyTrack's components, on top of
the shadcn `base-vega` primitives in `src/components/ui/`. Read this before
building or changing a component, layout, or interaction pattern.

## Icon size is `size-6` in feature UI, `size-4` everywhere else

Every icon that represents a *thing* the user is looking at or choosing —
category icons, the sidebar nav icons, an action's prefixed icon — is
`size-6` (24×24px): `<House aria-hidden="true" className="size-6" />`.

Everything else stays at the shadcn default. `buttonVariants` in
`button.tsx` sizes any icon without an explicit `size-*` class to `size-4`
(`[&_svg:not([class*='size-'])]:size-4`) — that default is correct for
chevrons, checkmarks, a dialog's close `X`, and other small chrome. Don't
add `size-6` there; a 24px close button reads oversized next to 14px body
text.

## Hover and focus use `bg-accent`/`bg-muted`, and both are darker than the
## shadcn default

`--muted` and `--accent` were tuned in `src/app/globals.css` (light:
`oklch(0.94 0 0)`, dark: `oklch(0.32 0 0)`) specifically so a `ghost`
button, a dropdown item, or a table row's `hover:bg-muted/50` reads as a
visible highlight against the page background rather than a near-invisible
tint. Everything that hovers/focuses through these tokens picked up the
change for free — do not reach for a one-off darker shade in a single
component; adjust the token if the highlight ever needs to change again.

## An icon-only control gets a `Tooltip`, always

If a control's accessible name is not also its visible text — an
icon-only button, `SidebarTrigger`, a row's ellipsis-vertical actions
trigger, the icon-picker's edit-pen button — wrap it:

```tsx
<Tooltip>
  <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={label} />}>
    <EllipsisVertical aria-hidden="true" className="size-6" />
  </TooltipTrigger>
  <TooltipContent>{label}</TooltipContent>
</Tooltip>
```

`SidebarMenuButton`'s own `tooltip` prop already does this for sidebar nav
items, and only shows it once the sidebar is collapsed to icons — a button
that already has a visible label next to it doesn't also need a tooltip
repeating that label.

The one deliberate exception is the icon picker's 113-icon grid
(`IconPicker`, `src/components/categories/icon-picker.tsx`): each button
is icon-only, but does not get a `Tooltip`. A tooltip per icon in a dense
grid is a hover tax on the exact screen where the user is scanning many
icons quickly, not reading one control closely — `aria-label={key}` alone
carries the accessible name. The grid's *trigger* (the small pen button
that opens it) is a single control and keeps its tooltip, per the rule
above.

## Row actions are an ellipsis-vertical menu, not inline buttons

A table row with more than one action (edit, delete, …) gets a single
`EllipsisVertical` trigger opening a `DropdownMenu`, not a row of separate
buttons — see `src/components/categories/category-row-actions.tsx`. The
trigger is icon-only, so it gets a `Tooltip` per the rule above (its label
is the column header's own text, e.g. `t("table.actions")`, so no new
translation key is needed for it).

### Menu items are color-coded, and hover never dilutes that color

Every actionable `DropdownMenuItem` picks a `variant`, and the icon and the
text both carry that variant's color **at all times, including on
hover/focus** — hovering "Delete" must not turn it gray-on-red or
white-on-red, it must stay red text on a **gray** highlight:

- `variant="destructive"` — red (`text-destructive`), for anything
  irreversible (delete).
- `variant="info"` — blue (`text-info`), for anything that opens an editor
  (edit). Added in `src/app/globals.css`/`button.tsx` alongside
  `destructive` — reach for it any time a future action needs the same
  "this is the safe, edit-like action" color, rather than inventing a new
  one-off blue.
- `variant="default"` — inherits the popover's foreground color, for
  anything neutral.

`DropdownMenuItem`'s and `DropdownMenuLinkItem`'s `data-[variant=…]`
classes in `dropdown-menu.tsx` implement this: `focus:bg-accent` (gray) is
shared across every variant, while `text-*`/`*:[svg]:text-*` pin the
variant's color regardless of focus state. Use `DropdownMenuLinkItem`
(renders a real `<a>`, via Base UI's `MenuLinkItem`) for an item that
navigates — `DropdownMenuItem` for one that acts. `DropdownMenuLinkItem`
defaults `closeOnClick` to `true` here (Base UI's own default is `false`),
so picking "Edit" closes the menu the same way every other item does.

A menu item that opens a confirmation dialog (delete) cannot use
`AlertDialogTrigger` nested inside it — Base UI closes the menu, and
unmounts the trigger, before the dialog would open. Control the dialog's
`open` state from the parent instead, and open it from the item's
`onClick`. See `category-row-actions.tsx` for the full pattern.

## A form is a 12-column grid, not `flex-col`, and every row fills 100%

`className="grid grid-cols-12 gap-4"` on the `<form>` itself
(`CategoryForm` is the reference) — never `flex flex-col`, and never a
`max-w-*` on the page wrapping it. Each field is a grid item with its own
`col-span-12` (full row) at the base breakpoint, narrowing at `lg:` so
that whatever fields belong on the same row together add up to `12`:

- **One field on a row** → `lg:col-span-12` (100% width). A field
  narrower than its row is the thing to avoid, not multiple fields
  sharing one.
- **Two evenly-weighted fields** → `lg:col-span-6` each (50/50). This is
  the default split; only give a field more than its even share when it
  explicitly needs the room (a paragraph-length field next to a 3-letter
  code, for instance).
- **A field that only needs a small, fixed amount of room** (an icon
  picker, a short code) — give it a small explicit span and let the
  bigger fields take the rest. `CategoryForm` is `lg:col-span-5`
  (name) + `lg:col-span-5` (description) + `lg:col-span-2` (icon) = 12,
  one row on large screens.
- **More fields than fit 12 columns** wrap on their own — CSS grid moves
  an item to the next row automatically when it doesn't fit what's left
  of the current one, with no media query of your own required beyond
  the per-field `col-span-*`/`lg:col-span-*` pair.

Text inputs also grow from the shadcn default (`h-9`) to `lg:h-11
lg:text-base` — a form pinned to its mobile sizing on a large monitor
reads cramped even once it's using the full row.

The submit button is its own `col-span-12` grid item, `w-full` on small
screens (a full-width tap target is correct on mobile) and
`lg:w-auto` with the *item* right-aligned via `lg:justify-self-end` on
large screens — `justify-self`, not `self-end`, because alignment along a
grid row's inline axis is the item's own `justify-self`, not the
container's cross-axis property `flex-col` used.

## Labels are bold, and a required field gets an asterisk

`Label` (`src/components/ui/label.tsx`) is `font-bold` for every label in
the app — this is a token-level change, not a per-field className, so it
applies everywhere `Label` is used without further action.

A field that is required *and has no value already filled in before the
user touches it* gets a trailing asterisk: `<Label htmlFor="name"
required>`. `Label`'s `required` prop appends a `text-destructive`
asterisk after the label text. It is decorative only — the field's own
`aria-invalid`/validation message is what actually conveys required-ness
to assistive tech, the same as before this prop existed.

"Already filled in" is what excludes a field like `CategoryForm`'s icon:
it is required by the schema, but `DEFAULT_CATEGORY_ICON` means it is
never actually empty from the moment the form mounts, so marking it
required would be misleading — there is nothing for the user to still
provide. A field like `description` has no asterisk for the opposite
reason: it truly is optional. `name` is the one field in `CategoryForm`
that is both required and starts empty, so it is the only one marked.

## Choosing an icon: an avatar, not a button showing the icon

The pattern for "this field's value is an icon" is the same one social
apps use for a profile photo: a round preview of the current value, with a
small round edit control overlaid at its bottom-right corner —

```tsx
<div className="relative inline-flex size-16 items-center justify-center rounded-full bg-muted">
  <SelectedIcon aria-hidden="true" className="size-6 text-muted-foreground" />
  <div className="absolute -right-1 -bottom-1">
    <IconPicker value={icon} onChange={...} />
  </div>
</div>
```

`IconPicker` itself is *only* the small round pen-icon trigger (`Pencil`,
`size-icon-sm`, `rounded-full`) plus the picker dialog — it no longer
renders the currently-selected icon itself, because the parent now owns
that in the avatar circle. This is why `IconPicker`'s own accessible
name/tooltip (`categories.iconPicker.title`, "Choose an icon") is what
labels the pen button; don't add a second caption next to it repeating the
same thing in different words — that was tried once
(`categories.form.chooseIcon`) and was redundant with both the field's own
`Label` and the pen button's tooltip, so it was removed rather than wired
up further.

## The icon picker has no search

`CATEGORY_ICONS` is a fixed, curated 113-icon allow-list (see
`.claude/rules/database.md`-adjacent design notes in
`src/lib/category-icons.ts`), not an open-ended catalog — small and
themed enough to scan by eye once the grid renders large. The dialog is
`sm:max-w-2xl` with `size-6` icons in an 8-column grid on larger viewports
(`grid-cols-6 sm:grid-cols-8`) specifically so scanning is fast without a
search box. If a future icon set grows past a few hundred entries, search
earns its place back — until then, one fewer control between the user and
a two-second choice is the better trade.

## Every route inside the dashboard shell ships a `loading.tsx`

This is `.claude/rules/navigation-loading.md`'s rule, restated as a
checklist item because it's easy to add a new route and forget the
sibling file: any `page.tsx` added under `src/app/[locale]/dashboard/`
gets a `loading.tsx` in the same commit, with a skeleton built from
`Skeleton` (`src/components/ui/skeleton.tsx`) that mirrors that page's
real layout — same headings, same table/form shape. Routes *outside* the
shell (sign-in, sign-up) intentionally use the full-screen overlay
instead, per `navigation-loading.md`'s "overlay when the shell changes,
skeleton when only the content changes" — that split is deliberate, not a
gap to fill with more skeletons.
