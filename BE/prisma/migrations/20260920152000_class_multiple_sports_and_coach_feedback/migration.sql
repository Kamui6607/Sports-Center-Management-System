-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COACH_CHANGED';

-- CreateTable
CREATE TABLE "CoachFeedback" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "classId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Class now supports multiple sports (implicit many-to-many join table)
CREATE TABLE "_ClassToSport" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "CoachFeedback_coachId_idx" ON "CoachFeedback"("coachId");

-- CreateIndex
CREATE INDEX "CoachFeedback_memberId_idx" ON "CoachFeedback"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachFeedback_coachId_memberId_classId_key" ON "CoachFeedback"("coachId", "memberId", "classId");

-- CreateIndex
CREATE UNIQUE INDEX "_ClassToSport_AB_unique" ON "_ClassToSport"("A", "B");

-- CreateIndex
CREATE INDEX "_ClassToSport_B_index" ON "_ClassToSport"("B");

-- AddForeignKey
ALTER TABLE "CoachFeedback" ADD CONSTRAINT "CoachFeedback_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFeedback" ADD CONSTRAINT "CoachFeedback_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "MemberProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFeedback" ADD CONSTRAINT "CoachFeedback_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassToSport" ADD CONSTRAINT "_ClassToSport_A_fkey" FOREIGN KEY ("A") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClassToSport" ADD CONSTRAINT "_ClassToSport_B_fkey" FOREIGN KEY ("B") REFERENCES "Sport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: keep the existing single-sport assignment of every class before dropping "sportId"
INSERT INTO "_ClassToSport" ("A", "B")
SELECT "id", "sportId" FROM "Class"
ON CONFLICT ("A", "B") DO NOTHING;

-- DropForeignKey
ALTER TABLE "Class" DROP CONSTRAINT "Class_sportId_fkey";

-- DropIndex
DROP INDEX "Class_sportId_idx";

-- AlterTable
ALTER TABLE "Class" DROP COLUMN "sportId";
