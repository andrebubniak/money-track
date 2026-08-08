# Git Commit Guideline

This file contains the guideline to create commit messages for git. Use this unless explicit asked otherwise.

## Format

For standard commits:

`<type>(<subject>): <short description>`

For miscellaneous commits:

`misc:`

The `misc` commit type does not include a subject. Its commit message should be defined in a file named `COMMIT_MESSAGE`.

## Commit Types

- `feat(<subject>)` — Add a new feature
- `improve(<subject>)` — Improve or enhance an existing feature
- `fix(<subject>)` — Fix a bug
- `refactor(<subject>)` — Change code without changing behavior
- `docs(<subject>)` — Update documentation
- `test(<subject>)` — Add or update tests
- `chore(<subject>)` — Maintenance or tooling changes
- `style(<subject>)` — Formatting or style-only changes
- `perf(<subject>)` — Improve performance
- `misc` — Miscellaneous changes

## Guidelines

- Always include the subject/feature in parentheses for standard commit types.
- Use kebab-case for the commit type and subject/feature.
- Keep the subject/feature concise and descriptive.
- Use the imperative mood in the description.
- Keep the description short and clear.
- Do not end the description with a period.
- Keep each commit focused on a single logical change.
- Avoid vague descriptions such as `update code` or `fix stuff`.
- For `misc` commits, do not include a subject.
- When it is a `misc` commit, you should automatically change the [COMMIT_MESSAGE](../../COMMIT_MESSAGE) file and use `git commit -F COMMIT_MESSAGE` to pull the file contents

## Examples

```text
feat(dashboard): create spending overview
improve(authentication): add Google login option
fix(transaction-creation): prevent duplicate transactions
refactor(expense-planning): simplify expense calculation logic
docs(card-creation): document card creation flow
test(authentication): add login form tests
chore(dependencies): update application dependencies
style(dashboard): format dashboard components
perf(reports): optimize monthly report generation

// COMMIT_MESSAGE file
misc:
- fix(transaction-creation): prevent duplicate transactions
- refactor(expense-planning): simplify expense calculation logic
- docs(card-creation): document card creation flow
```
