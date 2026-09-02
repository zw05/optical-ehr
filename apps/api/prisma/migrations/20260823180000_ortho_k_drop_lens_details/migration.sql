-- Lens details stay on the paper chart: the enrollment tracks follow-ups only.
ALTER TABLE "OrthoKEnrollment" DROP COLUMN "eyes";
ALTER TABLE "OrthoKEnrollment" DROP COLUMN "lensBrand";
ALTER TABLE "OrthoKEnrollment" DROP COLUMN "lensDesign";
ALTER TABLE "OrthoKEnrollment" DROP COLUMN "lensParams";

-- "Case number" is just the number.
ALTER TABLE "OrthoKEnrollment" RENAME COLUMN "caseNumber" TO "number";

ALTER INDEX "OrthoKEnrollment_practiceId_caseNumber_key"
    RENAME TO "OrthoKEnrollment_practiceId_number_key";
