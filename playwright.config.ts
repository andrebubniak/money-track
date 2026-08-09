import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const testDatabaseUrl = process.env.DATABASE_URL_TEST;

if (!testDatabaseUrl) {
  throw new Error(
    "DATABASE_URL_TEST is not set. The e2e suite must run against its own " +
      "database — refusing to fall back to DATABASE_URL.",
  );
}

// Global setup TRUNCATEs every table. If the two URLs ever point at the same
// database, that wipes development data with no warning. Fail closed.
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL_TEST is identical to DATABASE_URL. The e2e suite truncates " +
      "all tables — refusing to run against the development database.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  // These tests share one database and one dev server, so they run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    // Next.js does not override variables already present in process.env,
    // so this wins over the DATABASE_URL in .env.
    env: { DATABASE_URL: testDatabaseUrl },
  },
});
