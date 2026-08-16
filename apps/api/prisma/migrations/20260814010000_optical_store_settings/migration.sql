-- Practice identity
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "npi" TEXT;
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "taxId" TEXT;
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
ALTER TABLE "Practice" ADD COLUMN IF NOT EXISTS "hours" JSONB;

-- Patient policy link to catalog
ALTER TABLE "InsurancePolicy" ADD COLUMN IF NOT EXISTS "acceptedPayerId" TEXT;

-- Accepted payer catalog extras
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "eligibilityNotes" TEXT;
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "fax" TEXT;
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "website" TEXT;
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "payerId" TEXT;
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "frameAllowance" DECIMAL(10,2);
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "lensAllowance" DECIMAL(10,2);
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "examCopay" DECIMAL(10,2);
ALTER TABLE "AcceptedPayer" ADD COLUMN IF NOT EXISTS "requiresAuth" BOOLEAN NOT NULL DEFAULT false;

-- Frame catalog measurements
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "eye" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "bridge" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "temple" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "a" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "b" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "ed" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "material" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "shape" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "upc" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "reorderPoint" INTEGER;

-- Lens pricing
DO $$ BEGIN
    CREATE TYPE "LensDesign" AS ENUM ('SV', 'BIFOCAL', 'PAL', 'OFFICE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "OpticalAddOnKind" AS ENUM ('AR', 'UV', 'PHOTOCHROMIC', 'POLARIZED', 'BLUE_LIGHT', 'EDGE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "LensPriceList" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "design" "LensDesign" NOT NULL DEFAULT 'SV',
    "material" TEXT NOT NULL,
    "index" DECIMAL(4,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LensPriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "LensPriceCell" (
    "id" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "sphere" DECIMAL(5,2) NOT NULL,
    "cylinder" DECIMAL(5,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "LensPriceCell_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OpticalAddOn" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "OpticalAddOnKind" NOT NULL DEFAULT 'OTHER',
    "price" DECIMAL(10,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OpticalAddOn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LensPriceList_practiceId_name_key" ON "LensPriceList"("practiceId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "LensPriceCell_priceListId_sphere_cylinder_key" ON "LensPriceCell"("priceListId", "sphere", "cylinder");
CREATE INDEX IF NOT EXISTS "LensPriceCell_priceListId_idx" ON "LensPriceCell"("priceListId");
CREATE UNIQUE INDEX IF NOT EXISTS "OpticalAddOn_practiceId_name_key" ON "OpticalAddOn"("practiceId", "name");

DO $$ BEGIN
    ALTER TABLE "LensPriceList" ADD CONSTRAINT "LensPriceList_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "LensPriceCell" ADD CONSTRAINT "LensPriceCell_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "LensPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "OpticalAddOn" ADD CONSTRAINT "OpticalAddOn_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "InsurancePolicy" ADD CONSTRAINT "InsurancePolicy_acceptedPayerId_fkey" FOREIGN KEY ("acceptedPayerId") REFERENCES "AcceptedPayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
