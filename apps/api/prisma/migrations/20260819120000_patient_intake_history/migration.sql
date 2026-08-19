-- The paper intake questionnaire (Social, Family, ROS, Past Medical History)
-- kept on the patient chart and re-confirmed each visit, rather than re-asked.

CREATE TABLE IF NOT EXISTS "PatientIntakeHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "patientSignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientIntakeHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PatientIntakeHistory_patientId_key"
    ON "PatientIntakeHistory"("patientId");

DO $$ BEGIN
    ALTER TABLE "PatientIntakeHistory" ADD CONSTRAINT "PatientIntakeHistory_patientId_fkey"
        FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- One "Re-Reviewed Date / Dr.'s Signature" line per visit. Append-only.
CREATE TABLE IF NOT EXISTS "PatientHistoryReview" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "encounterId" TEXT,
    "reviewedById" TEXT NOT NULL,
    "changesNoted" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientHistoryReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PatientHistoryReview_intakeId_reviewedAt_idx"
    ON "PatientHistoryReview"("intakeId", "reviewedAt");

DO $$ BEGIN
    ALTER TABLE "PatientHistoryReview" ADD CONSTRAINT "PatientHistoryReview_intakeId_fkey"
        FOREIGN KEY ("intakeId") REFERENCES "PatientIntakeHistory"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "PatientHistoryReview" ADD CONSTRAINT "PatientHistoryReview_reviewedById_fkey"
        FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
