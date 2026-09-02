-- Voiding retracts a mistaken draft exam without destroying the record.
-- Signed exams stay immutable and are corrected with addenda instead.
ALTER TYPE "EncounterStatus" ADD VALUE 'VOIDED';

ALTER TABLE "Encounter" ADD COLUMN "voidedById" TEXT;
ALTER TABLE "Encounter" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "Encounter" ADD COLUMN "voidReason" TEXT;

ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
