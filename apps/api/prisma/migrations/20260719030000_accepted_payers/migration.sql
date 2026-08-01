-- CreateTable
CREATE TABLE "AcceptedPayer" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isVision" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcceptedPayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcceptedPayer_practiceId_isActive_idx" ON "AcceptedPayer"("practiceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AcceptedPayer_practiceId_name_key" ON "AcceptedPayer"("practiceId", "name");

-- AddForeignKey
ALTER TABLE "AcceptedPayer" ADD CONSTRAINT "AcceptedPayer_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
