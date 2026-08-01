-- AlterTable
ALTER TABLE "ReportTemplate" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark the newest active template of each kind as the practice default.
UPDATE "ReportTemplate" AS rt
SET "isDefault" = true
FROM (
  SELECT DISTINCT ON ("practiceId", "kind") id
  FROM "ReportTemplate"
  WHERE "isActive" = true
  ORDER BY "practiceId", "kind", "version" DESC, "createdAt" DESC
) AS newest
WHERE rt.id = newest.id;
