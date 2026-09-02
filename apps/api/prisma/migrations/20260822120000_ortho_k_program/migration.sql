-- CreateEnum
CREATE TYPE "OrthoKMilestone" AS ENUM ('DAY_1', 'DAY_2', 'WEEK_1', 'MONTH_1', 'MONTH_3', 'MONTH_6', 'INTERIM', 'ANNUAL');

-- CreateEnum
CREATE TYPE "OrthoKStatus" AS ENUM ('FITTING', 'ACTIVE', 'MAINTENANCE', 'ON_HOLD', 'DISCONTINUED');

-- CreateTable
CREATE TABLE "OrthoKEnrollment" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" "OrthoKStatus" NOT NULL DEFAULT 'FITTING',
    "startDate" TIMESTAMP(3),
    "eyes" TEXT,
    "lensBrand" TEXT,
    "lensDesign" TEXT,
    "lensParams" TEXT,
    "folderRef" TEXT,
    "notes" TEXT,
    "startedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrthoKEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrthoKVisit" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "milestone" "OrthoKMilestone" NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrthoKVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrthoKEnrollment_practiceId_status_idx" ON "OrthoKEnrollment"("practiceId", "status");

-- CreateIndex
CREATE INDEX "OrthoKEnrollment_patientId_idx" ON "OrthoKEnrollment"("patientId");

-- CreateIndex
CREATE INDEX "OrthoKVisit_enrollmentId_visitDate_idx" ON "OrthoKVisit"("enrollmentId", "visitDate");

-- AddForeignKey
ALTER TABLE "OrthoKEnrollment" ADD CONSTRAINT "OrthoKEnrollment_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrthoKEnrollment" ADD CONSTRAINT "OrthoKEnrollment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrthoKEnrollment" ADD CONSTRAINT "OrthoKEnrollment_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrthoKVisit" ADD CONSTRAINT "OrthoKVisit_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "OrthoKEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrthoKVisit" ADD CONSTRAINT "OrthoKVisit_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
