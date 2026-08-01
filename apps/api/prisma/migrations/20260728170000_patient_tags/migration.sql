-- CreateEnum
CREATE TYPE "PatientTag" AS ENUM ('ORTHO_K', 'MYOPIA_MANAGEMENT', 'SPECIALTY_CL', 'DRY_EYE', 'VISION_THERAPY', 'LOW_VISION');

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "tags" "PatientTag"[] DEFAULT ARRAY[]::"PatientTag"[];
