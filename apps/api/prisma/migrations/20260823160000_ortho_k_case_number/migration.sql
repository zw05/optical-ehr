-- The practice's own Ortho-K case numbering, counting from 1 per practice and
-- independent of the chart MRN.

ALTER TABLE "OrthoKEnrollment" ADD COLUMN "caseNumber" INTEGER;

-- Number the enrollments that already exist in enrollment order, so the sequence
-- reads the way the practice built it up.
WITH numbered AS (
    SELECT id, row_number() OVER (
        PARTITION BY "practiceId" ORDER BY "createdAt", id
    ) AS seq
    FROM "OrthoKEnrollment"
)
UPDATE "OrthoKEnrollment" e
SET "caseNumber" = numbered.seq
FROM numbered
WHERE e.id = numbered.id;

ALTER TABLE "OrthoKEnrollment" ALTER COLUMN "caseNumber" SET NOT NULL;

CREATE UNIQUE INDEX "OrthoKEnrollment_practiceId_caseNumber_key"
    ON "OrthoKEnrollment"("practiceId", "caseNumber");
