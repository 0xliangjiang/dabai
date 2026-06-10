-- CreateTable
CREATE TABLE "SubscribeGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscribeGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SubscribeGrant_templateId_used_idx" ON "SubscribeGrant"("templateId", "used");

-- CreateIndex
CREATE INDEX "SubscribeGrant_userId_used_idx" ON "SubscribeGrant"("userId", "used");
