<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

The project conventions are defined by subject on `.claude/rules`. **Before changing code of one of this subjects, read the corresponding file**

| File                                                           | When to read                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [feature-development.md](.claude/rules/feature-development.md) | When you need to create a new feature or a feature improvement                       |
| [commit-guideline.md](.claude/rules/commit-guideline.md)       | You need to commit/push any changes on git                                           |
| [validation.md](.claude/rules/validation.md)                   | You are validating any input — forms, Server Actions, Route Handlers, schemas        |
| [navigation-loading.md](.claude/rules/navigation-loading.md)   | You are adding a link, a route, or any in-app navigation                             |
| [i18n.md](.claude/rules/i18n.md)                               | You are adding or changing any user-visible copy, or a locale                        |
| [database.md](.claude/rules/database.md)                       | You are adding, changing, or reviewing a database model, field, or migration         |
| [ui.md](.claude/rules/ui.md)                                   | You are building or changing a UI component, layout, or visual/interaction pattern   |
