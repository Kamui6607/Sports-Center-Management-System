-- Đổi tên bảng bộ môn: "Sport" -> "Fitness" (chỉ đổi tên, KHÔNG mất dữ liệu).
-- Model Prisma vẫn là Sport (map sang bảng "Fitness"); code và API giữ nguyên.

-- Bảng chính
ALTER TABLE "Sport" RENAME TO "Fitness";
ALTER TABLE "Fitness" RENAME CONSTRAINT "Sport_pkey" TO "Fitness_pkey";
ALTER INDEX "Sport_name_key" RENAME TO "Fitness_name_key";

-- Bảng nối many-to-many Class <-> Fitness
ALTER TABLE "_ClassToSport" RENAME TO "_ClassToFitness";
ALTER INDEX "_ClassToSport_AB_unique" RENAME TO "_ClassToFitness_AB_unique";
ALTER INDEX "_ClassToSport_B_index" RENAME TO "_ClassToFitness_B_index";
ALTER TABLE "_ClassToFitness" RENAME CONSTRAINT "_ClassToSport_A_fkey" TO "_ClassToFitness_A_fkey";
ALTER TABLE "_ClassToFitness" RENAME CONSTRAINT "_ClassToSport_B_fkey" TO "_ClassToFitness_B_fkey";
