-- Tệp PDF/Excel đính kèm lộ trình tập luyện (idempotent).
CREATE TABLE IF NOT EXISTS "TrainingPlanAttachment" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingPlanAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TrainingPlanAttachment_planId_idx" ON "TrainingPlanAttachment"("planId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainingPlanAttachment_planId_fkey') THEN
    ALTER TABLE "TrainingPlanAttachment" ADD CONSTRAINT "TrainingPlanAttachment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'TrainingPlanAttachment_uploadedById_fkey') THEN
    ALTER TABLE "TrainingPlanAttachment" ADD CONSTRAINT "TrainingPlanAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
