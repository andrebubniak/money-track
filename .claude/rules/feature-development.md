# Feature Development Guideline

This file contains rules needed when creating a new feature or making a big improvement/change on an existing feature.

## When this guideline applies

**Only at the start of a new piece of feature work** — the moment you would create a branch for it. Steps 1–3 run once, in order, before any implementation begins.

It does **not** apply to work already under way. Once you are on the feature branch and building, a dirty working tree is the normal state of things: that is what your own uncommitted progress looks like. Do not re-run Step 1 between tasks, before a commit, or when the user asks for a follow-up change to the feature you are already building.

If you are unsure which situation you are in, ask. "Is this a new feature, or a continuation of the current one?" is a cheap question; aborting mid-feature because the tree is dirty is not.

## Step 1. Require a clean tree before branching

Before creating the branch in Step 2, run `git status --short` and confirm the working tree is clean.

The point is to keep unrelated work out of the new branch — not to police tidiness. If anything is dirty, **stop and tell the user to commit or stash it themselves.** Do not commit or stash on their behalf, and do not proceed. Unless they explicitly say otherwise, this is a hard stop.

What counts as dirty:

- Modified tracked files (` M`)
- Staged changes (`M `, `A `)
- Untracked files (`??`)

What does **not** count:

- Anything gitignored — `.env`, `.next/`, `node_modules/`, `.superpowers/`. These never appear in `git status` and are never a reason to stop.
- Files the toolchain rewrites on its own, most notably the `nextjs-agent-rules` block in `AGENTS.md`, which `next dev` re-adds every run. Reverting it only recreates it. Point it out and let the user decide whether to commit it.

If the user tells you to proceed anyway, proceed — and say plainly which changes are going to end up entangled with the new branch.

## Step 2. Create a new git branch

You should create a new git branch and switch to it. The branch should be named `claude/<feature_name>` or `claude/<feature_name>/<feature_slug>` if it is an existing feature. Keep the entire branch name under 60 characters.

branch names examples

- claude/auth: The authentication functionality
- claude/auth/github: Adding the github provider on the authentication functionality

# Step 3. Spec and implementation plan

You should create the feature specification and the implementation plan under [docs/superpowers](../../docs/superpowers). Ask all necessary questions to the user before writing these docs.
