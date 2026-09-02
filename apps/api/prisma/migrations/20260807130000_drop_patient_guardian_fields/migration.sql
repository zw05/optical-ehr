-- Guardian contact info was unused in practice; drop it from the patient chart.
ALTER TABLE "Patient" DROP COLUMN "guardianName";
ALTER TABLE "Patient" DROP COLUMN "guardianPhone";
