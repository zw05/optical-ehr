-- Recurring checks move from yearly to every six months, and lens renewals become
-- a logged visit so the program year can be counted from them.
--
-- Postgres cannot drop a value from an enum, so the type is rebuilt. No row has
-- ever held 'ANNUAL' (recurring reviews were only ever scheduled, never logged),
-- so the cast below cannot fail.
ALTER TYPE "OrthoKMilestone" RENAME TO "OrthoKMilestone_old";

CREATE TYPE "OrthoKMilestone" AS ENUM (
    'DAY_1',
    'DAY_2',
    'WEEK_1',
    'MONTH_1',
    'MONTH_3',
    'MONTH_6',
    'SEMIANNUAL',
    'INTERIM',
    'NEW_LENSES'
);

ALTER TABLE "OrthoKVisit"
    ALTER COLUMN "milestone" TYPE "OrthoKMilestone"
    USING "milestone"::text::"OrthoKMilestone";

DROP TYPE "OrthoKMilestone_old";

-- Recall rows are matched by reason text, so retire the annual-review wording.
-- The service rewrites this enrollment's queue on its next change anyway.
DELETE FROM "Recall" WHERE reason = 'Ortho-K — Annual review follow-up';
