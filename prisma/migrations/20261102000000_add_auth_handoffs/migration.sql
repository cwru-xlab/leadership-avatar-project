-- CreateTable
CREATE TABLE "AuthHandoff" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "browserNonceHash" TEXT,
    "userId" TEXT,
    "targetOrigin" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthHandoff_stateHash_key" ON "AuthHandoff"("stateHash");

-- CreateIndex
CREATE UNIQUE INDEX "AuthHandoff_codeHash_key" ON "AuthHandoff"("codeHash");

-- CreateIndex
CREATE INDEX "AuthHandoff_userId_idx" ON "AuthHandoff"("userId");

-- CreateIndex
CREATE INDEX "AuthHandoff_expiresAt_idx" ON "AuthHandoff"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthHandoff_consumedAt_idx" ON "AuthHandoff"("consumedAt");

-- AddForeignKey
ALTER TABLE "AuthHandoff" ADD CONSTRAINT "AuthHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
