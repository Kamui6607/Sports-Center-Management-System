/*
  Warnings:

  - Made the column `areaType` on table `Class` required. This step will fail if there are existing NULL values in that column.
  - Made the column `areaType` on table `Room` required. This step will fail if there are existing NULL values in that column.

  Backfill NULLs to 'INDOOR' first so the migration is safe to retry on
  databases that already contain rows (P3009 / SET NOT NULL failure).
*/
-- Backfill existing NULLs before enforcing NOT NULL (safe retry for P3009)
UPDATE "Class" SET "areaType" = 'INDOOR' WHERE "areaType" IS NULL;

-- Backfill existing NULLs before enforcing NOT NULL (safe retry for P3009)
UPDATE "Room" SET "areaType" = 'INDOOR' WHERE "areaType" IS NULL;

-- AlterTable
ALTER TABLE "Class" ALTER COLUMN "areaType" SET NOT NULL;

-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "areaType" SET NOT NULL;
