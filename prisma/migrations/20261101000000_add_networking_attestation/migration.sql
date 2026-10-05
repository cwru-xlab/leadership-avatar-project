-- CreateTable
CREATE TABLE "NetworkingAttestation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wordingVersion" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "NetworkingAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NetworkingAttestation_userId_attestedAt_idx" ON "NetworkingAttestation"("userId", "attestedAt");

-- CreateIndex
CREATE INDEX "NetworkingAttestation_userId_consumedAt_idx" ON "NetworkingAttestation"("userId", "consumedAt");

-- AddForeignKey
ALTER TABLE "NetworkingAttestation" ADD CONSTRAINT "NetworkingAttestation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
