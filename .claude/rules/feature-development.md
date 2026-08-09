# Feature Development Guideline

This file contains rules needed when creating a new feature or making a big improvement/change on an existing feature.

## Step 1. Check the current branch

When asked to create a new feature or make big changes on the code, check the current Git branch, and, unless explicit asked otherwise, abort this entire process if there are any uncommitted, unstaged, or untracked files in the working directory. Tell the user to commit or stash changes before proceeding, and DO NOT GO ANY FURTHER.

## Step 2. Create a new git branch

You should create a new git branch and switch to it. The branch should be named `claude/<feature_name>` or `claude/<feature_name>/<feature_slug>` if it is an existing feature. Keep the entire branch name under 60 characters.

branch names examples

- claude/auth: The authentication functionality
- claude/auth/github: Adding the github provider on the authentication functionality

# Step 3. Spec and implementation plan

You should create the feature specification and the implementation plan under [docs/superpowers](../../docs/superpowers). Ask all necessary questions to the user before writing these docs.
