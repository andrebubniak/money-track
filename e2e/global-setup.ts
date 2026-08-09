import { execSync } from "node:child_process";

import { Pool } from "pg";

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set.");

  // Bring the test database up to the current schema.
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  // Start every run from empty. CASCADE clears the dependent app tables too.
  //
  // The generated Prisma client (src/generated/prisma/client.ts) is
  // ESM-only (it references `import.meta.url` at module scope). Next.js and
  // Vitest both load it through an ESM-aware bundler, but Playwright's
  // global-setup runs as a plain Node script and previously tried to
  // require() that module, which failed outright ("Cannot use 'import.meta'
  // outside a module") and, even after forcing this file to load as ESM
  // (.mts), still failed with "Cannot require() ES Module ... in a cycle"
  // from Node's require(esm) interop. Since all we need here is a single
  // raw TRUNCATE, we use `pg` directly and skip PrismaClient entirely.
  const pool = new Pool({ connectionString: url });

  try {
    await pool.query(
      "TRUNCATE TABLE sessions, accounts, verifications, users RESTART IDENTITY CASCADE",
    );
  } finally {
    await pool.end();
  }
}
