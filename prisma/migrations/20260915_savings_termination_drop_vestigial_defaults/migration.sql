-- Drop two vestigial column defaults on SavingsTermination.
--
-- The live table carried DEFAULT (gen_random_uuid())::text on "id" and
-- DEFAULT CURRENT_TIMESTAMP on "updatedAt", written by
-- 20260316_savings_engine/migration.sql:83, which created the table by hand.
-- Prisma models those columns as @default(uuid()) and
-- @updatedAt, both of which it generates client-side: it emits no database
-- default for either, and always sends a value on insert.
--
-- So the defaults were never exercised, but they made every
-- `prisma migrate diff` emit a DROP DEFAULT pair for this table — which meant a
-- generated migration could never be applied as-is, and the real change had to
-- be picked out of it by hand each time. Removing them makes the database
-- match the schema, so the next diff comes back empty.
--
-- Safe to drop: nothing writes to this table outside Prisma. There is no raw
-- SQL anywhere in src/ or prisma/ ($executeRaw and $queryRaw have no matches),
-- so no insert can be relying on the database to fill these columns.
--
-- The matching schema.prisma change is on SavingsAccount, which gains
-- @@index([isPromoRate]) — that index exists in the database and simply was
-- never declared, which is the other half of the same drift.

ALTER TABLE "SavingsTermination" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "SavingsTermination" ALTER COLUMN "updatedAt" DROP DEFAULT;
