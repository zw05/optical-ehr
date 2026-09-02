-- Per-user permission overrides layered on top of the role defaults.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permissionOverrides" JSONB;

-- ---------- Lens pricing: cell grid -> power ranges ----------

CREATE TABLE IF NOT EXISTS "LensPriceRange" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "label" TEXT,
    "sphMin" DECIMAL(5,2) NOT NULL,
    "sphMax" DECIMAL(5,2) NOT NULL,
    "cylMin" DECIMAL(5,2) NOT NULL,
    "cylMax" DECIMAL(5,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LensPriceRange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LensPriceRange_priceListId_sortOrder_idx"
    ON "LensPriceRange"("priceListId", "sortOrder");

DO $$ BEGIN
    ALTER TABLE "LensPriceRange" ADD CONSTRAINT "LensPriceRange_priceListId_fkey"
        FOREIGN KEY ("priceListId") REFERENCES "LensPriceList"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Carry every existing priced cell over as a degenerate one-step band so no
-- price is lost. Sheets re-imported after this migration collapse into wider
-- bands automatically.
INSERT INTO "LensPriceRange" ("id", "priceListId", "sphMin", "sphMax", "cylMin", "cylMax", "price", "sortOrder")
SELECT "id", "priceListId", "sphere", "sphere", "cylinder", "cylinder", "price", 0
FROM "LensPriceCell"
ON CONFLICT DO NOTHING;

DROP TABLE IF EXISTS "LensPriceCell";

-- ---------- Contact lens pricing ----------

DO $$ BEGIN
    CREATE TYPE "ContactLensModality" AS ENUM ('DAILY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ContactLensType" AS ENUM ('SPHERICAL', 'TORIC', 'MULTIFOCAL', 'MULTIFOCAL_TORIC', 'RGP', 'SCLERAL', 'ORTHO_K', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ContactLensFeeKind" AS ENUM ('FITTING_STANDARD', 'FITTING_TORIC', 'FITTING_MULTIFOCAL', 'FITTING_SPECIALTY', 'FITTING_ORTHO_K', 'EVALUATION', 'FOLLOW_UP', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ContactLensProduct" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "modality" "ContactLensModality" NOT NULL DEFAULT 'MONTHLY',
    "lensType" "ContactLensType" NOT NULL DEFAULT 'SPHERICAL',
    "lensesPerBox" INTEGER,
    "boxesPerYearPerEye" INTEGER NOT NULL DEFAULT 4,
    "pricePerBox" DECIMAL(10,2) NOT NULL,
    "annualSupplyPrice" DECIMAL(10,2),
    "sixMonthPrice" DECIMAL(10,2),
    "rebateNote" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactLensProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactLensProduct_practiceId_brand_productName_key"
    ON "ContactLensProduct"("practiceId", "brand", "productName");
CREATE INDEX IF NOT EXISTS "ContactLensProduct_practiceId_isActive_idx"
    ON "ContactLensProduct"("practiceId", "isActive");

DO $$ BEGIN
    ALTER TABLE "ContactLensProduct" ADD CONSTRAINT "ContactLensProduct_practiceId_fkey"
        FOREIGN KEY ("practiceId") REFERENCES "Practice"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ContactLensFee" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ContactLensFeeKind" NOT NULL DEFAULT 'OTHER',
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactLensFee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ContactLensFee_practiceId_name_key"
    ON "ContactLensFee"("practiceId", "name");

DO $$ BEGIN
    ALTER TABLE "ContactLensFee" ADD CONSTRAINT "ContactLensFee_practiceId_fkey"
        FOREIGN KEY ("practiceId") REFERENCES "Practice"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ---------- Diagnosis / procedure code catalog ----------

DO $$ BEGIN
    CREATE TYPE "CodeSystem" AS ENUM ('ICD10', 'CPT', 'HCPCS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "CodeCatalogEntry" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "system" "CodeSystem" NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CodeCatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CodeCatalogEntry_practiceId_system_code_key"
    ON "CodeCatalogEntry"("practiceId", "system", "code");
CREATE INDEX IF NOT EXISTS "CodeCatalogEntry_practiceId_system_isActive_idx"
    ON "CodeCatalogEntry"("practiceId", "system", "isActive");

DO $$ BEGIN
    ALTER TABLE "CodeCatalogEntry" ADD CONSTRAINT "CodeCatalogEntry_practiceId_fkey"
        FOREIGN KEY ("practiceId") REFERENCES "Practice"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
