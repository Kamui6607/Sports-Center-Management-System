-- CreateEnum
CREATE TYPE "AreaType" AS ENUM ('POOL', 'INDOOR', 'OUTDOOR');

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "areaType" "AreaType";

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "areaType" "AreaType";

-- AlterTable
ALTER TABLE "Sport" ADD COLUMN     "areaTypes" "AreaType"[];
