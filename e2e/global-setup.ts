import { execSync } from "node:child_process";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../src/generated/prisma/client";

export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST is not set.");

  // Bring the test database up to the current schema.
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  // Start every run from empty. CASCADE clears the dependent app tables too.
  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    await prisma.$executeRawUnsafe(
      "TRUNCATE TABLE sessions, accounts, verifications, users RESTART IDENTITY CASCADE",
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
