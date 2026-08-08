-- Allow booking / registering patients before DOB is known (e.g. walk-ins).
ALTER TABLE "Patient" ALTER COLUMN "dateOfBirth" DROP NOT NULL;
