-- Attached docs: classify chart documents, carry structured values read off
-- them, and link them to the encounters they are relevant to.

DO $$ BEGIN
    CREATE TYPE "DocumentKind" AS ENUM ('EXTERNAL_RECORD', 'EXTERNAL_RX', 'KERATOMETRY', 'REFERRAL_LETTER', 'LAB_IMAGING', 'INSURANCE_CARD', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "DocumentReviewStatus" AS ENUM ('PENDING_REVIEW', 'REVIEWED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "externalProvider" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "documentDate" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "extractedData" JSONB;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewStatus" "DocumentReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedById" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

-- Pre-existing rows used the free-text `category` label; map the known values
-- onto the new enum so old uploads are not all stranded as OTHER.
UPDATE "Document" SET "kind" = 'INSURANCE_CARD' WHERE "kind" = 'OTHER' AND "category" = 'insurance-card';
UPDATE "Document" SET "kind" = 'EXTERNAL_RECORD' WHERE "kind" = 'OTHER' AND "category" = 'external-record';

CREATE INDEX IF NOT EXISTS "Document_patientId_kind_idx" ON "Document"("patientId", "kind");

CREATE TABLE IF NOT EXISTS "EncounterDocument" (
    "id" TEXT NOT NULL,
    "encounterId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "linkedById" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EncounterDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EncounterDocument_encounterId_documentId_key" ON "EncounterDocument"("encounterId", "documentId");
CREATE INDEX IF NOT EXISTS "EncounterDocument_documentId_idx" ON "EncounterDocument"("documentId");

DO $$ BEGIN
    ALTER TABLE "EncounterDocument" ADD CONSTRAINT "EncounterDocument_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Deleting the document removes its links; unlinking never deletes the file.
DO $$ BEGIN
    ALTER TABLE "EncounterDocument" ADD CONSTRAINT "EncounterDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "EncounterDocument" ADD CONSTRAINT "EncounterDocument_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
