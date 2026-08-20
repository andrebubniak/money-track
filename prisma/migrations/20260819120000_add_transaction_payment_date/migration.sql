-- Backfilled from `date`, not `now()`: that is what leaves every existing
-- paid row satisfying the new "payment date <= transaction date" rule, so
-- the migration cannot leave behind data the schema would reject.
ALTER TABLE "transactions" ADD COLUMN "payment_date" TIMESTAMP(3);

UPDATE "transactions" SET "payment_date" = "date" WHERE "is_paid" = true;

ALTER TABLE "transactions" DROP COLUMN "is_paid";
