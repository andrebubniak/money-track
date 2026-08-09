import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware replacements for `next/link` and `next/navigation`. Every call
 * site keeps its English path (`/dashboard`) and the active locale is added
 * automatically. Use these instead of the Next.js originals for all in-app
 * navigation — see `.claude/rules/navigation-loading.md`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
