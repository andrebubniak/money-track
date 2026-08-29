-- Backfilled from `date`, not `now()`: the row's own date is the closest
-- thing to a payment day the old `is_paid` boolean ever recorded, and it
-- satisfies the "payment date <= transaction date" half of the new rule for
-- every existing paid row.
--
-- It does not satisfy the other half. `createTransactionSchema` also caps
-- `payment_date` at today, and a paid occurrence of an installment plan can
-- legitimately be dated in the future, so a pre-existing paid row whose
-- `date` is still ahead of today comes back as `paymentDate.notInFuture`
-- the first time its owner opens it for editing — on a row they never
-- touched. That is the deliberate trade: clamping with
-- `LEAST(date, CURRENT_DATE)` would invent a payment day the user never
-- chose, which is exactly the mistake the mark-as-paid dialog was fixed to
-- avoid. The user re-dating the payment on that one edit is the correct
-- resolution; a silently fabricated date is not.
ALTER TABLE "transactions" ADD COLUMN "payment_date" TIMESTAMP(3);

UPDATE "transactions" SET "payment_date" = "date" WHERE "is_paid" = true;

ALTER TABLE "transactions" DROP COLUMN "is_paid";
